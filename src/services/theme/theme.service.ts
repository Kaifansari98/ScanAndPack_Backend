import { prisma } from "../../prisma/client";

export class ThemeService {
  /**
   * Create a new theme with its key-value mappings
   */
  static async createTheme(payload: {
    vendor_id: number;
    name: string;
    mappings: { key: string; light: string; dark: string }[];
  }) {
    const { vendor_id, name, mappings } = payload;

    return prisma.$transaction(async (tx) => {
      const theme = await tx.themeMaster.create({
        data: {
          vendor_id,
          name,
          mappings: {
            create: mappings.map(({ key, light, dark }) => ({ key, light, dark })),
          },
        },
        include: { mappings: true },
      });

      return theme;
    });
  }

  /**
   * Get all themes for a vendor (with their mappings)
   */
  static async getThemesByVendor(vendor_id: number) {
    return prisma.themeMaster.findMany({
      where: { vendor_id },
      include: { mappings: true },
      orderBy: { created_at: "desc" },
    });
  }

  /**
   * Get a single theme by id
   */
  static async getThemeById(vendor_id: number, theme_id: number) {
    return prisma.themeMaster.findFirst({
      where: { id: theme_id, vendor_id },
      include: { mappings: true },
    });
  }

  /**
   * Get the active theme for a vendor
   */
  static async getActiveTheme(vendor_id: number) {
    return prisma.themeMaster.findFirst({
      where: { vendor_id, is_active: true },
      include: { mappings: true },
    });
  }

  /**
   * Set a theme as active (deactivates all others for the vendor)
   */
  static async setActiveTheme(vendor_id: number, theme_id: number) {
    return prisma.$transaction(async (tx) => {
      // Verify theme belongs to this vendor
      const theme = await tx.themeMaster.findFirst({
        where: { id: theme_id, vendor_id },
      });

      if (!theme) throw new Error("Theme not found");

      // Deactivate all themes for this vendor
      await tx.themeMaster.updateMany({
        where: { vendor_id },
        data: { is_active: false },
      });

      // Activate the selected theme
      return tx.themeMaster.update({
        where: { id: theme_id },
        data: { is_active: true },
        include: { mappings: true },
      });
    });
  }

  /**
   * Update mappings for an existing theme (upsert per key)
   */
  static async updateThemeMappings(
    vendor_id: number,
    theme_id: number,
    mappings: { key: string; light: string; dark: string }[]
  ) {
    const theme = await prisma.themeMaster.findFirst({
      where: { id: theme_id, vendor_id },
    });

    if (!theme) throw new Error("Theme not found");

    await prisma.$transaction(
      mappings.map(({ key, light, dark }) =>
        prisma.themeMapping.upsert({
          where: { theme_id_key: { theme_id, key } },
          update: { light, dark },
          create: { theme_id, key, light, dark },
        })
      )
    );

    return prisma.themeMaster.findUnique({
      where: { id: theme_id },
      include: { mappings: true },
    });
  }

  /**
   * Delete a theme
   */
  static async deleteTheme(vendor_id: number, theme_id: number) {
    const theme = await prisma.themeMaster.findFirst({
      where: { id: theme_id, vendor_id },
    });

    if (!theme) throw new Error("Theme not found");

    return prisma.themeMaster.delete({ where: { id: theme_id } });
  }
}
