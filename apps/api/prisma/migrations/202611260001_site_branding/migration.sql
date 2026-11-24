-- Admin-managed hero slides: banners gain slide fields and an optional image (colour-only slides).
ALTER TABLE "banners" ALTER COLUMN "imageUrl" DROP NOT NULL;
ALTER TABLE "banners" ADD COLUMN "eyebrow" TEXT;
ALTER TABLE "banners" ADD COLUMN "ctaLabel" TEXT;
ALTER TABLE "banners" ADD COLUMN "secondaryLabel" TEXT;
ALTER TABLE "banners" ADD COLUMN "secondaryLink" TEXT;
ALTER TABLE "banners" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'dark';
ALTER TABLE "banners" ADD COLUMN "bgColor" TEXT;
ALTER TABLE "banners" ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'cover';
ALTER TABLE "banners" ADD CONSTRAINT "banners_theme_check" CHECK ("theme" IN ('dark', 'light'));
ALTER TABLE "banners" ADD CONSTRAINT "banners_layout_check" CHECK ("layout" IN ('cover', 'split'));
ALTER TABLE "banners" ADD CONSTRAINT "banners_bg_color_check" CHECK ("bgColor" IS NULL OR "bgColor" ~ '^#[0-9a-fA-F]{6}$');
