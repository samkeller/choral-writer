# Consignes pour le frontend

- Lire [`../../docs/web/DESIGN_SYSTEM.md`](../../docs/web/DESIGN_SYSTEM.md) avant de créer ou modifier une interface.
- Utiliser Mantine 8 et son thème centralisé en priorité ; ne pas ajouter un second système de styles.
- Réutiliser les composants de `src/components/` et respecter les responsabilités de `api/`, `auth/`, `hooks/`, `pages/` et `theme/`.
- Préserver l'authentification, les routes et les contrats API ; ne pas ajouter de fonctionnalité métier fictive.
- Limiter le CSS global aux bases du document ; toute exception UI locale va dans un CSS Module utilisant les variables Mantine.
- Documenter les nouvelles conventions durables et éviter les abstractions sans réutilisation concrète.
- Vérifier au minimum `pnpm --filter @choral-writer/web typecheck`, `pnpm --filter @choral-writer/web test` et `pnpm --filter @choral-writer/web build`.
- Pour l'organisation et les états UI, voir [`../../docs/web/FRONTEND_CONVENTIONS.md`](../../docs/web/FRONTEND_CONVENTIONS.md) ; pour les commandes et workspaces, voir [`../../docs/DEVELOPMENT.md`](../../docs/DEVELOPMENT.md).
