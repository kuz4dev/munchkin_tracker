package store

import (
	"context"
	"os"
	"testing"
)

// TestPostgresStore runs the store contract against a real database.
// Set TEST_DATABASE_URL to enable it, e.g. with `docker compose up -d db`:
//
//	TEST_DATABASE_URL=postgres://munchkin:munchkin@localhost:5433/munchkin_test go test ./...
func TestPostgresStore(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pg, err := OpenPostgres(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pg.Close)

	testStore(t, func(t *testing.T) Store {
		if _, err := pg.pool.Exec(ctx, `TRUNCATE games, game_seats, game_events, app_metrics`); err != nil {
			t.Fatal(err)
		}
		return pg
	})
}
