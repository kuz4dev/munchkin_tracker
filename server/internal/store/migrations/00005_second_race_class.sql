-- +goose Up
-- The Half-Breed and Super Munchkin cards: an optional second race or class.
ALTER TABLE game_seats
    ADD COLUMN half_breed     boolean NOT NULL DEFAULT false,
    ADD COLUMN race2          text    NOT NULL DEFAULT '',
    ADD COLUMN super_munchkin boolean NOT NULL DEFAULT false,
    ADD COLUMN class2         text    NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE game_seats
    DROP COLUMN half_breed,
    DROP COLUMN race2,
    DROP COLUMN super_munchkin,
    DROP COLUMN class2;
