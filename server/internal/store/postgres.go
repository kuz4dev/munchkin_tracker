package store

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Postgres struct {
	pool *pgxpool.Pool
}

// OpenPostgres connects to the database and applies pending migrations.
func OpenPostgres(ctx context.Context, url string) (*Postgres, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	// Poolers in transaction mode (PgBouncer, Neon's "-pooler" host) hand server
	// connections to other clients between transactions, so pgx's cached named
	// statements collide ("prepared statement name is already in use"). Unnamed
	// statements work everywhere; the URL may still choose another mode.
	if !strings.Contains(url, "default_query_exec_mode") {
		cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	if err := migrate(pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return &Postgres{pool: pool}, nil
}

func migrate(pool *pgxpool.Pool) error {
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()
	goose.SetBaseFS(migrations)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.Up(db, "migrations")
}

func (p *Postgres) Apply(ctx context.Context, ops []Op) error {
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		batch := &pgx.Batch{}
		for _, op := range ops {
			if err := queueOp(batch, op); err != nil {
				return err
			}
		}
		results := tx.SendBatch(ctx, batch)
		for i := 0; i < batch.Len(); i++ {
			if _, err := results.Exec(); err != nil {
				results.Close()
				return err
			}
		}
		return results.Close()
	})
}

func queueOp(b *pgx.Batch, op Op) error {
	switch op := op.(type) {
	case CreateGame:
		g := op.Game
		b.Queue(`INSERT INTO games (id, code, status, created_at, last_activity_at) VALUES ($1, $2, $3, $4, $5)`,
			g.ID, g.Code, g.Status, g.CreatedAt, g.LastActivityAt)
	case AddSeat:
		s := op.Seat
		b.Queue(`INSERT INTO game_seats (id, game_id, session_hash, name, level, gear_bonus, gender, race, class, joined_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			s.ID, s.GameID, s.SessionHash, s.Name, s.Level, s.GearBonus, s.Gender, s.Race, s.Class, s.JoinedAt)
		queueTouch(b, s.GameID, s.JoinedAt)
	case UpdateSeatStats:
		st := op.Stats
		b.Queue(`UPDATE game_seats SET level = $2, gear_bonus = $3, gender = $4, race = $5, class = $6 WHERE id = $1`,
			op.SeatID, st.Level, st.GearBonus, st.Gender, st.Race, st.Class)
	case RemoveSeat:
		b.Queue(`UPDATE game_seats SET left_at = $2 WHERE id = $1`, op.SeatID, op.At)
	case AppendEvent:
		e := op.Event
		b.Queue(`INSERT INTO game_events (game_id, seq, seat_id, player_name, type, field, old_value, new_value, created_at)
			VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), $9)`,
			e.GameID, e.Seq, e.SeatID, e.PlayerName, e.Type, e.Field, e.OldValue, e.NewValue, e.CreatedAt)
		queueTouch(b, e.GameID, e.CreatedAt)
	case SetHost:
		b.Queue(`UPDATE games SET host_seat_id = NULLIF($2, '')::uuid WHERE id = $1`, op.GameID, op.SeatID)
	case FinishGame:
		b.Queue(`UPDATE games SET status = 'finished', winner_seat_id = NULLIF($2, '')::uuid,
				finished_at = $3, last_activity_at = $3
			WHERE id = $1 AND status = 'active'`,
			op.GameID, op.WinnerSeatID, op.At)
	case TouchGame:
		queueTouch(b, op.GameID, op.At)
	case CloseGame:
		b.Queue(`UPDATE games SET status = 'abandoned' WHERE id = $1 AND status = 'active'`, op.GameID)
	case CountMetric:
		b.Queue(`INSERT INTO app_metrics (day, event, count) VALUES ($1::date, $2, $3)
			ON CONFLICT (day, event) DO UPDATE SET count = app_metrics.count + EXCLUDED.count`,
			op.Day.UTC().Format(time.DateOnly), op.Event, op.Count)
	default:
		return fmt.Errorf("unknown op %T", op)
	}
	return nil
}

func queueTouch(b *pgx.Batch, gameID string, at time.Time) {
	b.Queue(`UPDATE games SET last_activity_at = GREATEST(last_activity_at, $2) WHERE id = $1`, gameID, at)
}

func (p *Postgres) LoadActiveGame(ctx context.Context, code string, activeSince time.Time) (*LoadedGame, error) {
	var g Game
	err := p.pool.QueryRow(ctx,
		`SELECT id::text, code, status, created_at, last_activity_at, COALESCE(host_seat_id::text, '')
		FROM games WHERE code = $1 AND status = 'active'`,
		code,
	).Scan(&g.ID, &g.Code, &g.Status, &g.CreatedAt, &g.LastActivityAt, &g.HostSeatID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if g.LastActivityAt.Before(activeSince) {
		_, err := p.pool.Exec(ctx, `UPDATE games SET status = 'abandoned' WHERE id = $1 AND status = 'active'`, g.ID)
		return nil, err
	}

	loaded := &LoadedGame{Game: g}

	rows, err := p.pool.Query(ctx,
		`SELECT id::text, game_id::text, session_hash, name, level, gear_bonus, gender, race, class, joined_at
		FROM game_seats WHERE game_id = $1 AND left_at IS NULL ORDER BY joined_at`, g.ID)
	if err != nil {
		return nil, err
	}
	loaded.Seats, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (Seat, error) {
		var s Seat
		err := row.Scan(&s.ID, &s.GameID, &s.SessionHash, &s.Name,
			&s.Level, &s.GearBonus, &s.Gender, &s.Race, &s.Class, &s.JoinedAt)
		return s, err
	})
	if err != nil {
		return nil, err
	}

	if err := p.pool.QueryRow(ctx, `SELECT COALESCE(MAX(seq), 0) FROM game_events WHERE game_id = $1`, g.ID).
		Scan(&loaded.LastSeq); err != nil {
		return nil, err
	}
	loaded.RecentEvents, err = p.ListEvents(ctx, g.ID, loaded.LastSeq+1, RecentEventsLimit)
	if err != nil {
		return nil, err
	}
	return loaded, nil
}

func (p *Postgres) ListEvents(ctx context.Context, gameID string, beforeSeq int64, limit int) ([]Event, error) {
	rows, err := p.pool.Query(ctx,
		`SELECT game_id::text, seq, seat_id::text, player_name, type,
			COALESCE(field, ''), COALESCE(old_value, ''), COALESCE(new_value, ''), created_at
		FROM (
			SELECT * FROM game_events WHERE game_id = $1 AND seq < $2 ORDER BY seq DESC LIMIT $3
		) page ORDER BY seq`,
		gameID, beforeSeq, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Event, error) {
		var e Event
		err := row.Scan(&e.GameID, &e.Seq, &e.SeatID, &e.PlayerName, &e.Type,
			&e.Field, &e.OldValue, &e.NewValue, &e.CreatedAt)
		return e, err
	})
}

func (p *Postgres) AbandonStale(ctx context.Context, activeSince time.Time) (int64, error) {
	tag, err := p.pool.Exec(ctx,
		`UPDATE games SET status = 'abandoned' WHERE status = 'active' AND last_activity_at < $1`, activeSince)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (p *Postgres) Metrics(ctx context.Context, since time.Time) ([]MetricCount, error) {
	rows, err := p.pool.Query(ctx,
		`SELECT day::text, event, count FROM app_metrics WHERE day >= $1::date ORDER BY day, event`,
		since.UTC().Format(time.DateOnly))
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (MetricCount, error) {
		var m MetricCount
		var day string
		if err := row.Scan(&day, &m.Event, &m.Count); err != nil {
			return m, err
		}
		m.Day, err = time.Parse(time.DateOnly, day)
		return m, err
	})
}

func (p *Postgres) Ping(ctx context.Context) error {
	return p.pool.Ping(ctx)
}

func (p *Postgres) Close() {
	p.pool.Close()
}
