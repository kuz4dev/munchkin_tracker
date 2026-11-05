-- +goose Up
-- The level that wins the game; the host may change it during play.
ALTER TABLE games
    ADD COLUMN end_level int NOT NULL DEFAULT 10;

-- +goose Down
ALTER TABLE games DROP COLUMN end_level;
