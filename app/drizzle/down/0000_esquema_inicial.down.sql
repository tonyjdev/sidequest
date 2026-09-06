-- Reversión de 0000_esquema_inicial.
-- El orden es el inverso de las dependencias: primero lo que referencia, después
-- lo referenciado, para no tener que desactivar las claves ajenas.

DROP TABLE `attempts`;
--> statement-breakpoint
DROP TABLE `question_tag`;
--> statement-breakpoint
DROP TABLE `question_resources`;
--> statement-breakpoint
DROP TABLE `question_options`;
--> statement-breakpoint
DROP TABLE `questions`;
--> statement-breakpoint
DROP TABLE `subtopics`;
--> statement-breakpoint
DROP TABLE `topics`;
--> statement-breakpoint
DROP TABLE `subjects`;
--> statement-breakpoint
DROP TABLE `tags`;
--> statement-breakpoint
DROP TABLE `sessions`;
--> statement-breakpoint
DROP TABLE `settings`;
