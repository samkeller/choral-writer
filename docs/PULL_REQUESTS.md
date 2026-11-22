# Pull requests

Une PR est lue par un humain qui doit, **en quelques minutes**, comprendre pourquoi elle existe, ce qu'elle change, comment la tester et ce qu'elle risque. La description est une **synthèse** : courte, précise, sans paraphraser le diff.

## Publier une PR

1. **Ouvrir la PR** vers la branche d'intégration (`feat/v2` pendant la V2), avec une description qui suit le [modèle](#modèle). Toute section sans objet porte « Sans objet » plutôt que de disparaître.
2. **Faire relire par un agent autonome** : lancer la compétence `code-review` sur la PR. Elle tourne dans une session distincte de celle qui a écrit le code, et publie ses constats en commentaire de la PR.
3. **Laisser le mainteneur relire, tester et fusionner.** Seul le mainteneur fusionne : l'auteur d'une PR, humain ou agent, ne fusionne jamais la sienne.

## Règles de rédaction

- **Pourquoi avant quoi.** Le problème ou la décision qui motive la PR vient en premier ; le ticket est cité par son titre et son lien.
- **Comportement visible d'abord**, impact technique ensuite.
- **Honnêteté sur l'incertitude.** Tout ce qui n'a pas été exécuté ou observé va dans « Non vérifié », nommément. Une vérification n'est listée comme passée que si elle a été lancée.
- **Testable par un humain.** « Comment tester » part d'un état précis : branche, migrations, données. Il donne des étapes numérotées, chacune avec son résultat attendu. Il couvre au moins le parcours principal et un cas limite.
- **Captures pour toute modification d'UI**, avant et après, prises sur des données fictives. Si elles n'ont pas pu être produites, le dire dans « Non vérifié ».
- **Dépôt public.** Pas d'extrait de récit, de prompt réel, de whiteboard, de nom de projet, de secret ni de donnée personnelle, captures comprises.

## Modèle

```markdown
**En bref** : <une ou deux phrases : ce que la PR permet, pour qui>

Ticket : [<titre du ticket>](<lien>)

## Pourquoi
<le problème ou la décision qui motive la PR>

## Ce qui change
- **Visible** : <comportement observable par l'utilisateur>
- **Technique** : <contrats, schémas, migrations, modules touchés>

## Décisions notables
<choix d'architecture et alternatives écartées, en une ligne chacun>

## Comment tester
Prérequis : `gh pr checkout <n>`, `pnpm install`, <`pnpm db:migrate` si migration>, `pnpm dev`, <données de départ>.
1. <action> → <résultat attendu>
2. <cas limite> → <résultat attendu>

## Captures
<avant / après pour toute modification d'UI>

## Vérifications
- Exécuté : <typecheck, build, tests : nombres>
- Non vérifié : <ce qui n'a pas été testé ou observé, et pourquoi>

## Risques
- **Rayon d'impact** : <ce qui peut casser au-delà du périmètre visé>
- **Régression** : <comportement existant modifié, à surveiller>
- **Réversibilité** : <revert simple ou non ; migration, données écrites>
```
