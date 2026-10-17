-- +goose Up
-- the reserved "no meal" (decisions/0008): a slot left empty on purpose. a
-- fixed id, the same on every phone (model.NoMeal); stamped with a rev of its
-- own so a phone's first sync brings it like any other row.
UPDATE rev SET value = value + 1;
INSERT INTO meals (id, name, rev)
    VALUES ('00000000-0000-0000-0000-000000000000', 'No meal', (SELECT value FROM rev));

-- +goose Down
DELETE FROM meals WHERE id = '00000000-0000-0000-0000-000000000000';
