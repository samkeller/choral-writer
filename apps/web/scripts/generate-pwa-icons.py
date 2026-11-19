"""Génère les icônes PWA de Choral Writer à partir du logo de la marque.

Le logo source (`public/assets/logo.png`) est un tracé transparent : il est
détouré, redimensionné puis composé sur la surface sombre de l'application afin
de produire des icônes lisibles sur l'écran d'accueil Android.

Usage : python apps/web/scripts/generate-pwa-icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

BACKGROUND = (41, 43, 50, 255)  # #292b32 — surface `dark.7`, identique à `theme-color`
SOURCE = Path(__file__).parent.parent / "public" / "assets" / "logo.png"
OUTPUT_DIR = Path(__file__).parent.parent / "public" / "icons"

# Part du côté occupée par le logo. Les icônes `maskable` restent dans la zone
# de sécurité (cercle central de 80 %), les icônes `any` peuvent occuper un peu
# plus de place pour rester lisibles à petite taille.
GLYPH_RATIO_ANY = 0.72
GLYPH_RATIO_MASKABLE = 0.56


def _load_logo() -> Image.Image:
    """Charge le logo détouré de son padding transparent."""
    logo = Image.open(SOURCE).convert("RGBA")
    bounds = logo.getbbox()
    if bounds is None:
        raise ValueError(f"Le logo {SOURCE} est entièrement transparent.")
    return logo.crop(bounds)


def render(size: int, *, maskable: bool) -> Image.Image:
    """Compose une icône carrée opaque.

    Le fond couvre toute la surface : les icônes `maskable` peuvent ainsi être
    rognées par le lanceur sans perdre le logo, qui reste dans la zone de sécurité.
    """
    logo = _load_logo()
    ratio = GLYPH_RATIO_MASKABLE if maskable else GLYPH_RATIO_ANY

    target = round(size * ratio)
    scale = target / max(logo.width, logo.height)
    glyph = logo.resize(
        (max(1, round(logo.width * scale)), max(1, round(logo.height * scale))),
        Image.LANCZOS,
    )

    image = Image.new("RGBA", (size, size), BACKGROUND)
    image.alpha_composite(glyph, ((size - glyph.width) // 2, (size - glyph.height) // 2))
    return image


def main() -> None:
    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-192.png", 192, True),
        ("icon-maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, True),
    ]
    for name, size, maskable in targets:
        path = OUTPUT_DIR / name
        render(size, maskable=maskable).save(path, format="PNG", optimize=True)
        print(f"{path.name}: {size}x{size}")


if __name__ == "__main__":
    main()
