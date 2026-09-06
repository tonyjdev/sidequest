-- Valores iniciales de `settings` (docs/decisiones.md §3, §7 y docs/especificacion.md §4.4).
--
-- No son datos de ejemplo: sin ellos la selección ponderada no tiene con qué
-- calcular, así que viajan en la migración y no en el sembrado de desarrollo.
-- Todos son ajustables desde el panel sin desplegar.

INSERT INTO `settings` (`key`, `value`, `type`) VALUES
	('visible_options_default', '4', 'number'),
	('weight_new_boost', '10', 'number'),
	('weight_maturity_days', '30', 'number'),
	('weight_failure', '1.5', 'number'),
	('weight_difficulty_easy', '1', 'number'),
	('weight_difficulty_medium', '1', 'number'),
	('weight_difficulty_hard', '1', 'number'),
	('cooldown_hours', '24', 'number'),
	('attempt_token_ttl_seconds', '300', 'number'),
	('session_max_questions', '20', 'number');
