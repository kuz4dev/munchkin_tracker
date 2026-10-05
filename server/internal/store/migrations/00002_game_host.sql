-- +goose Up
-- The player who may finish the game. Games created before this column get a
-- host when they are next loaded (the longest-seated player).
ALTER TABLE games
    ADD COLUMN host_seat_id uuid REFERENCES game_seats (id);

-- +goose Down
ALTER TABLE games DROP COLUMN host_seat_id;
