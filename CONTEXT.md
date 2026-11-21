# Choral-writer — glossaire

Vocabulaire du domaine. Ce fichier ne décrit pas l'implémentation.

## Récit

- **Récit** : l'histoire produite au fil des tours d'un projet, dans une branche donnée.
- **Personnage** : un être qui existe *dans la narration* (protagoniste joué par l'utilisateur, PNJ, figure hors champ). Un personnage n'est pas un agent ; il peut être porté par un agent, par plusieurs, ou par aucun.
- **Protagoniste** : le personnage joué par l'utilisateur. La saisie décide de ce qu'il tente, dit ou fait ; le récit décide de ce qui en résulte.
- **PNJ** : personnage non joué par l'utilisateur.
- **Hors champ** : ce qui existe et évolue dans le monde du récit sans apparaître dans la scène en cours.
- **Développement** : un fait qui arrive dans le monde du récit pendant un tour, dans la scène ou hors champ. Un développement hors champ est arrivé même si le récit ne le raconte pas.
- **Intention** : ce qu'un personnage poursuit d'un tour à l'autre (objectif, plan en cours, situation, relations utiles).

## Pipeline

- **Agent** : un rôle LLM configuré (instructions, version, accès mémoire) qui intervient dans le pipeline. Un agent est un outil, jamais un être du récit.
- **Agent d'analyse** : agent *générique* qui examine la situation avant la narration et apporte une perspective au Narrateur. Il peut incarner un personnage, l'ensemble des personnages absents de la scène, une force narrative (« agent du chaos »), un vérificateur de cohérence, ou toute autre perspective : son rôle n'est fixé que par ses instructions. C'est notamment le moyen de faire exister des personnages hors champ.
- **Whiteboard** : la vue partagée, pour un tour, des contributions des agents d'analyse que reçoit le Narrateur. Une contribution est soit une perspective (avis, suggestion), soit un développement.
- **Direction** : phase facultative entre l'analyse et la restitution, qui oriente le tour sans en fixer l'issue.
- **Directeur** : l'agent de la direction. Il retient ou écarte les contributions du whiteboard et oriente la scène, y compris contre la saisie ; il ne fixe pas le dénouement et ne passe jamais outre ce qu'un agent d'analyse dit du personnage qu'il incarne.
- **Nudge** : une pression typée que le Directeur exerce sur la manière de raconter un tour (rendre saillant, retarder, mettre une intention au premier plan, compliquer une issue, relancer) sans en fixer l'issue. Un nudge n'introduit pas de fait : c'est le rôle d'un développement.
- **Narrateur** : l'agent de restitution qui écrit la prose montrée à l'utilisateur.
- **Gardien** : l'agent de restitution qui propose des modifications de la mémoire.
- **Tour** : une exécution du pipeline pour une saisie utilisateur.

## Interface

- **Mode Lecture** : la manière immersive de suivre un récit (saisie, texte, progression discrète du tour). Il ne révèle rien de ce que le récit cache.
- **Mode Debug** : la manière d'analyser un récit (attribution des contributions, composition du contexte, coûts, changements de configuration, état caché du monde). Il « spoile » par nature et ne montre qu'une synthèse hiérarchisée : trop de données tuent la donnée.
