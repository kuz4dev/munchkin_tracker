-- +goose Up
CREATE TABLE games (
    id               uuid        PRIMARY KEY,
    code             text        NOT NULL,
    status           text        NOT NULL CHECK (status IN ('active', 'finished', 'abandoned')),
    created_at       timestamptz NOT NULL,
    last_activity_at timestamptz NOT NULL,
    finished_at      timestamptz,
    winner_seat_id   uuid
);

-- Codes are reused once a game is over, so they are only unique among active games.
CREATE UNIQUE INDEX games_active_code ON games (code) WHERE status = 'active';
CREATE INDEX games_active_last_activity ON games (last_activity_at) WHERE status = 'active';

CREATE TABLE game_seats (
    id           uuid        PRIMARY KEY,
    game_id      uuid        NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    session_hash text        NOT NULL,
    name         text        NOT NULL,
    level        int         NOT NULL,
    gear_bonus   int         NOT NULL,
    gender       text        NOT NULL,
    race         text        NOT NULL,
    class        text        NOT NULL,
    joined_at    timestamptz NOT NULL,
    left_at      timestamptz,
    user_id      uuid -- filled in once accounts exist
);

CREATE INDEX game_seats_game ON game_seats (game_id);

ALTER TABLE games
    ADD CONSTRAINT games_winner_seat_fk FOREIGN KEY (winner_seat_id) REFERENCES game_seats (id);

CREATE TABLE game_events (
    game_id     uuid        NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    seq         bigint      NOT NULL,
    seat_id     uuid        NOT NULL REFERENCES game_seats (id) ON DELETE CASCADE,
    player_name text        NOT NULL,
    type        text        NOT NULL,
    field       text,
    old_value   text,
    new_value   text,
    created_at  timestamptz NOT NULL,
    PRIMARY KEY (game_id, seq)
);

-- +goose Down
DROP TABLE game_events;
ALTER TABLE games DROP CONSTRAINT games_winner_seat_fk;
DROP TABLE game_seats;
DROP TABLE games;
