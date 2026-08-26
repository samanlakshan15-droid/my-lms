import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

export async function getOrCreateSiteSettings() {
  const [existing] = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(siteSettings)
    .values({
      id: 1,
      backgroundColor: "#f1f5f9",
      textColor: "#0f172a",
      backgroundImageUrl: "",
      welcomeText: "Welcome to the LMS",
    })
    .returning();

  return created;
}
