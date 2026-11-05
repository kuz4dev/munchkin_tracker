-- +goose Up
-- Barbarian was added by mistake: no classic Munchkin set has that class.
-- A player's other class moves up; without one they have no class.
UPDATE game_seats SET class = class2, class2 = '' WHERE class = 'barbarian' AND class2 <> '';
UPDATE game_seats SET class = 'none' WHERE class = 'barbarian';
UPDATE game_seats SET class2 = '' WHERE class2 = 'barbarian';

-- +goose Down
-- Nothing to restore: the old values are gone and "none" stays valid.
SELECT 1;
