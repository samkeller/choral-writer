# Choral-writer — glossaire

Vocabulaire du domaine. Ce fichier ne décrit pas l'implémentation.

## Récit

- **Récit** : l'histoire produite au fil des tours d'un projet, dans une branche donnée.
- **Personnage** : un être qui existe *dans la narration* (protagoniste joué par l'utilisateur, PNJ, figure hors champ). Un personnage n'est pas un agent ; il peut être porté par un agent, par plusieurs, ou par aucun.
- **PNJ** : personnage non joué par l'utilisateur.
- **Hors champ** : ce qui existe et évolue dans le monde du récit sans apparaître dans la scène en cours.

## Pipeline

- **Agent** : un rôle LLM configuré (instructions, version, accès mémoire) qui intervient dans le pipeline. Un agent est un outil, jamais un être du récit.
- **Agent d'analyse** : agent *générique* qui examine la situation avant la narration et apporte une perspective au Narrateur. Il peut incarner un personnage, l'ensemble des personnages absents de la scène, une force narrative (« agent du chaos »), un vérificateur de cohérence, ou toute autre perspective : son rôle n'est fixé que par ses instructions. C'est notamment le moyen de faire exister des personnages hors champ.
- **Whiteboard** : la vue partagée, pour un tour, des contributions des agents d'analyse que reçoit le Narrateur.
- **Narrateur** : l'agent de restitution qui écrit la prose montrée à l'utilisateur.
- **Gardien** : l'agent de restitution qui propose des modifications de la mémoire.
- **Tour** : une exécution du pipeline pour une saisie utilisateur.

## Interface

- **Mode Lecture** : la manière immersive de suivre un récit (saisie, texte, progression discrète du tour). Il ne révèle rien de ce que le récit cache.
- **Mode Debug** : la manière d'analyser un récit (attribution des contributions, composition du contexte, coûts, changements de configuration, état caché du monde). Il « spoile » par nature et ne montre qu'une synthèse hiérarchisée : trop de données tuent la donnée.
