# Planification avant génération et créativité narrative des LLM

Recherche liée à l'issue #13 « Expérience : leviers contre une narration linéaire ».
Date : 2026-11-20.

## Question

Le Narrateur écrit, dans un seul appel streamé, une section `<resolution>` (décision factuelle de ce qui se passe ce tour) puis une section `<prose>` qui la rend (`apps/api/src/modules/chat/services/narratorService.ts`). La prose est jugée linéaire (A → B), pauvre en ouvertures, en description et en ambiance.

Hypothèse : s'engager sur l'issue avant d'écrire réduit la surprise ; planifier de la *matière* (conflit, décor, personnages, éléments sensoriels, pistes alternatives) vaudrait mieux que planifier l'*issue*.

Que dit la littérature primaire (2019–2026) sur l'effet d'une planification ou d'un raisonnement explicite avant génération sur la créativité, la surprise, la diversité et la texture des récits, par opposition à la cohérence ?

Conventions : chaque affirmation renvoie à une source lue (au minimum le résumé ; « texte complet » quand le corps de l'article a été lu). **[non vérifié]** = affirmation non contrôlée dans la source primaire. **[inférence]** = transposition de ma part au cas de choral-writer.

## Résumé

1. **La planification d'une issue améliore surtout la cohérence et la fidélité au plan, pas la surprise.** Re3 et DOC mesurent cohérence de l'intrigue et pertinence ; seul DOC mesure aussi l'« intéressant » (gain relatif à Re3, pas à « sans plan »).
2. **Un plan nu (« outline ») ne produit pas de tension.** Tian et al. (EMNLP 2024) : la condition *Outline-Only* n'est jugée la plus haletante que dans 7,9 % des cas, contre 48,3 % quand le plan doit expliciter des *points de bascule* (point de non-retour, revers majeur, climax). Ce qu'on met dans le plan compte plus que le fait de planifier.
3. **Planifier la matière plutôt que l'enchaînement fonctionne.** Agents' Room (ICLR 2025) fait produire séparément conflit, personnages, décor et intrigue dans un brouillon partagé avant l'écriture ; contre une génération de bout en bout *avec plan*, l'évaluateur LLM préfère Agents' Room à 75 % en créativité et 81 % en qualité de langue.
4. **Le raisonnement explicite (CoT) n'améliore pas la qualité perçue en écriture créative, mais peut augmenter la diversité.** Sprague et al. (ICLR 2025) : gains du CoT concentrés sur maths et logique. Morain & Ventura (ICCC 2025) : R1 (CoT) n'est pas meilleur que le prompt basique en qualité, nouveauté ou créativité perçues, mais produit les sorties les plus diverses ; les prompts longs réduisent la diversité.
5. **Le défaut de fond est connu et structurel** : récits LLM homogènes, positifs, peu tendus, aux bascules précipitées (Tian et al. 2024) ; éléments d'intrigue repris d'une génération à l'autre (Xu et al., PNAS 2025) ; 3 à 10 fois moins de tests de créativité réussis que des professionnels (Chakrabarty et al., CHI 2024).

Aucune étude lue ne compare directement « planifier l'issue » à « planifier des éléments ou possibilités » à structure égale. Les résultats ci-dessus convergent pourtant vers l'hypothèse **[inférence]**.

## Sources et constats

### Planifier pour la cohérence

**Yao et al., « Plan-And-Write: Towards Better Automatic Storytelling », AAAI 2019** — [arXiv:1811.05701](https://arxiv.org/abs/1811.05701) (résumé).
Génère d'abord une *storyline* (suite de mots-clés) puis l'histoire, en mode statique (plan complet d'abord) ou dynamique (plan et texte entrelacés). Les récits sont « more diverse, coherent, and on topic than those generated without creating a full plan ». Cadre pré-LLM (récits de cinq phrases, modèles entraînés pour la tâche). Le résumé ne dit pas quel schéma l'emporte. Ce résultat montre que, dans des modèles faibles, un plan *de matière* (mots-clés) réduit la répétition ; il ne dit rien de l'engagement sur une issue.

**Yang et al., « Re3: Generating Longer Stories With Recursive Reprompting and Revision », EMNLP 2022** — [arXiv:2210.06774](https://arxiv.org/abs/2210.06774) (résumé).
Plan structuré, puis rédaction guidée par le plan, reclassement, édition. Contre une génération directe : +14 points absolus d'histoires jugées à intrigue cohérente, +20 points de pertinence par rapport à la prémisse. Le résumé ne mesure ni créativité ni intérêt.

**Yang et al., « DOC: Improving Long Story Coherence With Detailed Outline Control », ACL 2023** — [arXiv:2212.10077](https://arxiv.org/abs/2212.10077) (résumé).
Plan hiérarchique plus détaillé et contrôleur qui force le texte à le suivre. Contre Re3 : +22,5 points de cohérence, +28,2 de pertinence au plan, +20,7 d'« interestingness ». Un plan plus détaillé, qui « déplace davantage le travail créatif dans la planification », rend donc l'histoire plus intéressante *que Re3*. Pas de comparaison avec une génération sans plan sur l'intérêt.

À retenir **[inférence]** : cette lignée vise des récits longs, où l'échec typique est la dérive. Un tour de jeu de rôle fait quelques paragraphes ; le problème n'y est pas la dérive mais la platitude. Les gains de cohérence sont peu transposables ; le gain d'intérêt de DOC suggère que la *richesse* du plan compte.

### Ce qu'on met dans le plan

**Tian et al., « Are Large Language Models Capable of Generating Human-Level Narratives? », EMNLP 2024** — [arXiv:2407.13248](https://arxiv.org/abs/2407.13248) (texte complet, HTML v2).
- Diagnostic : « LLM stories are homogeneously positive and lack tension ». GPT-4 avance nettement le revers majeur et le climax (« early occurrence of TP4 and TP5 ») : il précipite les bascules, ce qui réduit le suspense. Arcs biaisés vers le positif (« Riches to Rags » : 14,6 % des récits humains, 1,3 % chez GPT-4).
- Intervention : planifier puis développer, avec trois conditions. *Outline-Only* (plan simple), *+ Self TPs* (le plan doit marquer point de non-retour, revers majeur et climax, définitions fournies), *+ Human TPs*.
- Résultats (évaluation humaine, part des « meilleur ») : suspense 7,9 % (Outline-Only) contre 48,3 % (+Self TPs) ; préférence globale 13,5 % contre 43,8 %. Une variante *Arc-Enhanced* (forme d'arc, nombre de montées et chutes, états initial et final du protagoniste) l'emporte en diversité de thème (64 % contre 5 %) et de type de conflit (55 % contre 5 %). Aucune différence sur le décor (32 % chacun).

C'est la source la plus directement utile. Le plan nu donne un récit plat ; le plan qui impose des *tensions* et des *revers* donne du suspense. Le décor ne se diversifie pas par ce levier : il faut le demander à part **[inférence]**.

**Xie & Riedl, « Creating Suspenseful Stories: Iterative Planning with Large Language Models », EACL 2024** — [arXiv:2402.17119](https://arxiv.org/abs/2402.17119) (résumé).
Planification itérative zéro-shot fondée sur deux théories du suspense (psychologie cognitive, narratologie), validée par évaluation humaine. Les auteurs notent que les LLM restent « unreliable » pour le suspense sans ce guidage. Le détail des étapes n'a pas été lu **[non vérifié]**.

### Planifier la matière : Agents' Room

**Huot et al., « Agents' Room: Narrative Generation through Multi-step Collaboration », ICLR 2025** — [arXiv:2410.02603](https://arxiv.org/abs/2410.02603) (texte complet, HTML v2).
- Quatre agents de planification ([conflict], [character], [setting], [plot]) écrivent dans un *scratchpad* partagé ; ils « flesh out key components of the content but do not write the story as such ». Cinq agents d'écriture rédigent ensuite exposition, montée, climax, retombée, dénouement.
- Contre une génération de bout en bout *avec plan* (E2E plan, zéro-shot), l'évaluateur LLM préfère Agents' Room plan+write dans 74,6 % des cas : intrigue 63,6 %, créativité 75,5 %, développement 75,9 %, langue 81,1 %.
- L'évaluation humaine préfère les variantes avec agents d'écriture. Les variantes « plan seul » réussissent mal, ce que les auteurs attribuent au finaliseur trop simple.
- Limites : pas d'ablation par agent de planification ; histoires plus longues (préférence pour la longueur mesurée à environ 0,51, donc faible) ; retours qualitatifs sur un vocabulaire répétitif et des ruptures de ton.

À retenir **[inférence]** : décomposer la planification en *matière* (conflit, personnages, décor) bat un plan monolithique, surtout en langue et créativité. Mais l'effet mêle planification spécialisée et écriture par section ; on ne peut pas l'attribuer à la seule nature du plan.

### Raisonner avant d'écrire (CoT, modèles à raisonnement)

**Sprague et al., « To CoT or not to CoT? Chain-of-thought helps mainly on math and symbolic reasoning », ICLR 2025** — [arXiv:2409.12183](https://arxiv.org/abs/2409.12183) (résumé).
Méta-analyse et expériences : bénéfices du CoT « primarily on tasks involving math or logic », gains « much smaller » ailleurs. Rien de spécifique sur la créativité.

**Liu et al., « Mind Your Step (by Step): Chain-of-Thought can Reduce Performance on Tasks where Thinking Makes Humans Worse », ICML 2025** — [arXiv:2410.21333](https://arxiv.org/abs/2410.21333) (résumé via recherche, pages arXiv/PMLR) **[non vérifié en détail]**.
Sur des tâches où la délibération verbale nuit aux humains, le CoT fait chuter certains modèles (jusqu'à −36,3 points pour o1-preview contre GPT-4o) ; sur d'autres, pas d'effet. Pas de tâche d'écriture créative.

**Morain & Ventura, « Is Prompt Engineering the Creativity Knob for Large Language Models? », ICCC 2025** — [PDF](https://computationalcreativity.net/iccc25/papers/iccc25-morain2025prompt.pdf) (texte complet).
- Compare prompt basique, prompt rédigé par un humain, OPRO et R1 (CoT), sur blagues, poèmes, histoires en six mots, *flash fiction*.
- Humains : aucune différence significative de qualité, nouveauté ou créativité, sauf humain > R1 (écart 0,091 sur 5). Classement par préférence : basique 2,74, R1 2,58, humain 2,52, OPRO 2,15.
- Diversité (embeddings) : R1 la plus diverse (0,571 de distance moyenne), puis basique (0,493), humain (0,447), OPRO (0,376). Les auteurs : « longer prompts tend to constrain output diversity while chain-of-thought prompting increases diversity ».
- Toutes méthodes confondues, les modèles « rely on common tropes and cliches ». GPT-4o surestime systématiquement la qualité, surtout pour R1 (+0,84).
- Limites : 10 artefacts par case, textes très courts, R1 comparé à GPT-4o (deux modèles différents).

**Gurung & Lapata, « Learning to Reason for Long-Form Story Generation », 2025** — [arXiv:2503.22828](https://arxiv.org/abs/2503.22828) (résumé).
Raisonnement appris par RL sur un résumé de l'histoire, produisant un plan détaillé du chapitre suivant ; chapitres préférés « across almost all metrics » par des humains. Plan appris, pas un plan imposé par prompt.

**Cao et al., « DPWriter: Reinforcement Learning with Diverse Planning Branching for Creative Writing », 2026** — [arXiv:2601.09609](https://arxiv.org/abs/2601.09609) (résumé).
Fait diverger les sorties *à l'étape de planification* et récompense la diversité de groupe ; « improves output diversity without compromising generation quality ». Indique que la planification est un bon point d'injection de diversité, à condition de lui demander d'explorer et non de converger.

### Homogénéité et prévisibilité

**Chakrabarty et al., « Art or Artifice? Large Language Models and the False Promise of Creativity », CHI 2024** — [arXiv:2309.14556](https://arxiv.org/abs/2309.14556) (résumé).
TTCW : 14 tests binaires (fluidité, flexibilité, originalité, élaboration). Les récits LLM passent « 3-10X less TTCW tests » que ceux de professionnels ; aucun LLM juge ne corrèle positivement avec les experts.

**Xu et al., « Echoes in AI: Quantifying lack of plot diversity in LLM outputs », PNAS 122(35), 2025** — [arXiv:2501.00273](https://arxiv.org/abs/2501.00273) (résumé).
Score *Sui Generis* : unicité d'un élément d'intrigue parmi des continuations alternatives générées pour le même prompt. Les récits de GPT-4 et LLaMA-3 « often consist of plot elements that are echoed across a number of generations », y compris d'un modèle à l'autre ; corrélation modérée avec la surprise jugée par des humains.

**Chakrabarty, Laban & Wu, « Can AI writing be salvaged? », CHI 2025** — [arXiv:2409.14509](https://arxiv.org/abs/2409.14509) (résumé).
Des écrivains professionnels s'accordent sur sept idiosyncrasies des textes LLM (dont « clichés, unnecessary exposition » ; liste complète **[non vérifié]**). Aucun des trois modèles testés (GPT-4o, Claude 3.5 Sonnet, Llama 3.1 70B) n'est meilleur que les autres. L'édition automatique ciblée sur ces défauts rapproche le texte de l'écriture humaine.

## Lecture pour choral-writer

**[inférence]** sur l'ensemble de cette section.

1. La `<resolution>` actuelle est l'équivalent d'un *Outline-Only* au format d'un tour : elle fixe A → B sans exiger ni tension, ni revers, ni matière. C'est la condition qui obtient les pires scores de suspense chez Tian et al.
2. L'écrire *avant* la prose, dans le même appel, fait de la prose une réalisation de surface de ce plan. La littérature montre que le texte suit fidèlement le plan (Re3, DOC) : un plan plat donne une prose plate.
3. Le levier n'est probablement pas « planifier ou non », mais *quoi* planifier : tensions et revers (Tian), conflit, personnages, décor séparément (Agents' Room), plusieurs pistes divergentes (DPWriter, Xu et al.).
4. Le décor ne se diversifie pas tout seul (Tian : aucun gain sur le décor). L'ambiance et la description doivent figurer explicitement dans la matière planifiée.
5. Les prompts plus longs réduisent la diversité (Morain & Ventura) : enrichir la matière ne doit pas se faire en allongeant indéfiniment les consignes.
6. Tout juge LLM surestime la créativité et corrèle mal avec les experts (Chakrabarty 2024, Morain & Ventura). La comparaison côte à côte par le mainteneur, prévue par #13, est la bonne méthode d'évaluation.

## Variantes de prompt à tester

Toutes rejouent les mêmes tours réels, même modèle, même température, plusieurs tirages par tour (pour voir aussi la diversité entre tirages, à la Xu et al.).

**A. Référence.** Prompt actuel : `<resolution>` puis `<prose>`.

**B. Matière plutôt qu'issue.** Remplacer `<resolution>` par une section `<matiere>` courte : tension en jeu, un revers ou obstacle possible, deux détails sensoriels du lieu, ce que veut chaque personnage présent, une piste laissée ouverte. Pas de « ce qui se passe ». Puis `<prose>`. Teste directement l'hypothèse (Tian, Agents' Room).

**C. Prose d'abord, résolution après.** `<prose>` puis `<resolution>`, la résolution devenant un résumé factuel de ce que la prose a établi, destiné au gardien de mémoire. Préserve le contrat de données pour la mémoire tout en retirant l'engagement préalable. Le parseur (`narratorParser.ts`) et l'affichage (`LLMResponseDisplay.tsx`) supposent aujourd'hui l'ordre inverse : à adapter dans le script d'expérience seulement.

**D. Sans planification.** `<prose>` seule ; les faits sont extraits ensuite par l'agent de mémoire. Ligne de base « pas de plan », à comparer à B pour séparer l'effet « retirer l'issue » de l'effet « ajouter de la matière ».

Lecture attendue : si B > A, le contenu du plan est le levier. Si C ≈ D > A, c'est l'engagement préalable qui bride. Si B > C, D, il faut planifier, mais autre chose. Dans tous les cas où A perd, la question « faut-il une étape de résolution factuelle distincte ? » revient dans le périmètre, comme le note #13.

## Limites

- Aucune étude lue n'isole « planifier l'issue » contre « planifier des éléments » à format égal ; la recommandation repose sur une convergence de résultats.
- Les travaux sur la planification portent surtout sur des récits longs et autonomes, pas sur des tours courts de fiction interactive.
- Plusieurs sources n'ont été lues qu'au résumé (indiqué pour chacune).
