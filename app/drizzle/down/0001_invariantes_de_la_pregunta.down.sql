-- Reversión de 0001_invariantes_de_la_pregunta.
-- Los disparadores primero: el procedimiento es lo que llaman.

DROP TRIGGER `question_options_before_delete`;
--> statement-breakpoint
DROP TRIGGER `question_options_before_update`;
--> statement-breakpoint
DROP TRIGGER `question_options_before_insert`;
--> statement-breakpoint
DROP TRIGGER `questions_before_update`;
--> statement-breakpoint
DROP TRIGGER `questions_before_insert`;
--> statement-breakpoint
DROP PROCEDURE `sidequest_assert_question_options`;
