-- Reversión de 0002_parametros_por_defecto.
-- Solo los parámetros que insertó la migración: lo que se haya añadido después
-- desde el panel no es asunto suyo.

DELETE FROM `settings` WHERE `key` IN (
	'visible_options_default',
	'weight_new_boost',
	'weight_maturity_days',
	'weight_failure',
	'weight_difficulty_easy',
	'weight_difficulty_medium',
	'weight_difficulty_hard',
	'cooldown_hours',
	'attempt_token_ttl_seconds',
	'session_max_questions'
);
