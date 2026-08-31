-- +goose Up

-- Insert browser proctoring and fullscreen lockdown rules into proctor_rules
INSERT INTO proctor_rules (id, category, title, description, weight, enabled) VALUES
    ('web.fullscreen_exit', 'BROWSER', 'Browser Exited Fullscreen', 'Contestant exited full screen lockdown mode during active competition', 15, true),
    ('web.window_blur', 'BROWSER', 'Window Focus Lost (App Switch)', 'Browser window lost focus to an external application, desktop, or IDE', 20, true),
    ('web.tab_switch', 'BROWSER', 'Browser Tab Switched / Hidden', 'Contestant switched to another browser tab or minimized window', 20, true),
    ('web.devtools_attempt', 'BROWSER', 'Developer Tools / Inspection Attempt', 'Contestant attempted opening browser developer tools or viewing source code', 25, true),
    ('web.lockout_exceeded', 'BROWSER', 'Browser Lockout Violations Exceeded', 'Contestant exceeded maximum allowed browser focus violations or timeout', 35, true)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    weight = EXCLUDED.weight,
    enabled = EXCLUDED.enabled;

-- +goose Down
DELETE FROM proctor_rules WHERE id IN (
    'web.fullscreen_exit',
    'web.window_blur',
    'web.tab_switch',
    'web.devtools_attempt',
    'web.lockout_exceeded'
);
