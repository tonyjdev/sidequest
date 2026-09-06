-- Lo que la base impone sobre la pregunta, y que ninguna capa de arriba puede
-- saltarse ni olvidar.
--
-- Primero, `questions.version` se incrementa sola cuando cambia el contenido de
-- la pregunta: cada intento guarda la versión que se mostró, y ese número solo
-- vale de algo si nadie puede dejar de subirlo.
--
-- Y después, las invariantes de publicación de docs/especificacion.md §3.5:
--
--   - una pregunta publicada tiene al menos dos opciones,
--   - una pregunta publicada tiene al menos una opción correcta,
--   - una pregunta `single` publicada tiene exactamente una correcta.
--
-- Cruzan dos tablas, así que un CHECK no puede expresarlas. Las impone un
-- procedimiento al que llaman cinco disparadores: los dos sentidos por los que
-- se puede romper la invariante son publicar una pregunta y tocar sus opciones.
--
-- Consecuencia buscada: una pregunta no se puede insertar ya publicada, porque
-- en ese instante no puede tener opciones. El camino es borrador → opciones →
-- publicar, que es también el de la importación.

CREATE PROCEDURE `sidequest_assert_question_options`(
	IN p_question_id BIGINT UNSIGNED,
	IN p_status VARCHAR(16),
	IN p_type VARCHAR(16),
	IN p_total_delta INT,
	IN p_correct_delta INT
)
BEGIN
	DECLARE v_total INT DEFAULT 0;
	DECLARE v_correct INT DEFAULT 0;

	IF p_status = 'published' THEN
		SELECT COUNT(*), COALESCE(SUM(`is_correct`), 0)
			INTO v_total, v_correct
			FROM `question_options`
			WHERE `question_id` = p_question_id;

		SET v_total = v_total + p_total_delta;
		SET v_correct = v_correct + p_correct_delta;

		IF v_total < 2 THEN
			SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Una pregunta publicada necesita al menos dos opciones';
		END IF;

		IF v_correct < 1 THEN
			SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Una pregunta publicada necesita al menos una opción correcta';
		END IF;

		IF p_type = 'single' AND v_correct <> 1 THEN
			SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Una pregunta de selección única publicada necesita exactamente una opción correcta';
		END IF;
	END IF;
END
--> statement-breakpoint
CREATE TRIGGER `questions_before_insert` BEFORE INSERT ON `questions`
FOR EACH ROW
BEGIN
	IF NEW.`status` = 'published' THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Una pregunta no se crea publicada: créala en borrador, añade sus opciones y publícala';
	END IF;
END
--> statement-breakpoint
CREATE TRIGGER `questions_before_update` BEFORE UPDATE ON `questions`
FOR EACH ROW
BEGIN
	-- `<=>` compara con NULL sin propagarlo, que es lo que hace falta en
	-- `explanation` y `visible_options`. Publicar, archivar o mover la pregunta
	-- de subtema no son ediciones de contenido y no suben la versión.
	IF NOT (NEW.`statement` <=> OLD.`statement`)
		OR NOT (NEW.`explanation` <=> OLD.`explanation`)
		OR NOT (NEW.`type` <=> OLD.`type`)
		OR NOT (NEW.`difficulty` <=> OLD.`difficulty`)
		OR NOT (NEW.`visible_options` <=> OLD.`visible_options`) THEN
		-- Absoluto y no incremental: da igual qué versión mande quien escribe.
		SET NEW.`version` = OLD.`version` + 1;
	END IF;

	CALL `sidequest_assert_question_options`(NEW.`id`, NEW.`status`, NEW.`type`, 0, 0);
END
--> statement-breakpoint
CREATE TRIGGER `question_options_before_insert` BEFORE INSERT ON `question_options`
FOR EACH ROW
BEGIN
	DECLARE v_status VARCHAR(16);
	DECLARE v_type VARCHAR(16);

	SELECT `status`, `type` INTO v_status, v_type
		FROM `questions` WHERE `id` = NEW.`question_id`;

	CALL `sidequest_assert_question_options`(
		NEW.`question_id`, v_status, v_type, 1, IF(NEW.`is_correct`, 1, 0)
	);
END
--> statement-breakpoint
CREATE TRIGGER `question_options_before_update` BEFORE UPDATE ON `question_options`
FOR EACH ROW
BEGIN
	DECLARE v_status VARCHAR(16);
	DECLARE v_type VARCHAR(16);
	DECLARE v_old_status VARCHAR(16);
	DECLARE v_old_type VARCHAR(16);

	SELECT `status`, `type` INTO v_status, v_type
		FROM `questions` WHERE `id` = NEW.`question_id`;

	IF OLD.`question_id` = NEW.`question_id` THEN
		CALL `sidequest_assert_question_options`(
			NEW.`question_id`, v_status, v_type,
			0, IF(NEW.`is_correct`, 1, 0) - IF(OLD.`is_correct`, 1, 0)
		);
	ELSE
		-- Mover una opción de pregunta afecta a las dos: se comprueban ambas.
		SELECT `status`, `type` INTO v_old_status, v_old_type
			FROM `questions` WHERE `id` = OLD.`question_id`;

		CALL `sidequest_assert_question_options`(
			OLD.`question_id`, v_old_status, v_old_type, -1, -IF(OLD.`is_correct`, 1, 0)
		);
		CALL `sidequest_assert_question_options`(
			NEW.`question_id`, v_status, v_type, 1, IF(NEW.`is_correct`, 1, 0)
		);
	END IF;
END
--> statement-breakpoint
CREATE TRIGGER `question_options_before_delete` BEFORE DELETE ON `question_options`
FOR EACH ROW
BEGIN
	DECLARE v_status VARCHAR(16);
	DECLARE v_type VARCHAR(16);

	SELECT `status`, `type` INTO v_status, v_type
		FROM `questions` WHERE `id` = OLD.`question_id`;

	CALL `sidequest_assert_question_options`(
		OLD.`question_id`, v_status, v_type, -1, -IF(OLD.`is_correct`, 1, 0)
	);
END
