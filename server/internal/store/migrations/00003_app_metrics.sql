-- +goose Up
-- Anonymous counters sent by the web app: no user, device or IP, only how
-- many times each event happened per day (UTC).
CREATE TABLE app_metrics (
    day   date   NOT NULL,
    event text   NOT NULL,
    count bigint NOT NULL,
    PRIMARY KEY (day, event)
);

-- One row per day (UTC): the game funnel from the game tables next to the
-- app counters. Read it in the Neon SQL editor:
--   SELECT * FROM daily_stats LIMIT 30;
CREATE VIEW daily_stats AS
WITH game_sizes AS (
    SELECT g.*, (SELECT count(*) FROM game_seats s WHERE s.game_id = g.id) AS players
    FROM games g
),
games_per_day AS (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
           count(*)                                      AS rooms_created,
           count(*) FILTER (WHERE players >= 2)          AS rooms_with_friends,
           count(*) FILTER (WHERE status = 'finished')   AS games_finished,
           sum(players)                                  AS players,
           round(avg(players), 1)                        AS avg_players,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - created_at) / 60)
                 FILTER (WHERE status = 'finished')::numeric) AS median_game_minutes
    FROM game_sizes
    GROUP BY 1
),
metrics_per_day AS (
    SELECT day,
           sum(count) FILTER (WHERE event = 'visit')            AS visits,
           sum(count) FILTER (WHERE event = 'launch_installed') AS installed_launches,
           sum(count) FILTER (WHERE event = 'install_click')    AS install_clicks,
           sum(count) FILTER (WHERE event = 'install_accepted') AS installs,
           sum(count) FILTER (WHERE event = 'invite')           AS invites
    FROM app_metrics
    GROUP BY day
)
SELECT day,
       coalesce(m.visits, 0)             AS visits,
       coalesce(m.installed_launches, 0) AS installed_launches,
       coalesce(g.rooms_created, 0)      AS rooms_created,
       coalesce(g.rooms_with_friends, 0) AS rooms_with_friends,
       coalesce(g.games_finished, 0)     AS games_finished,
       coalesce(g.players, 0)            AS players,
       g.avg_players,
       g.median_game_minutes,
       coalesce(m.invites, 0)            AS invites,
       coalesce(m.install_clicks, 0)     AS install_clicks,
       coalesce(m.installs, 0)           AS installs
FROM games_per_day g
FULL JOIN metrics_per_day m USING (day)
ORDER BY day DESC;

-- +goose Down
DROP VIEW daily_stats;
DROP TABLE app_metrics;
