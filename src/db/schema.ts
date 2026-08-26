import { integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    idNo: text("id_no").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idNoUnique: uniqueIndex("users_id_no_unique").on(table.idNo),
    emailUnique: uniqueIndex("users_email_unique").on(table.email),
  }),
);

export const teacherAccounts = pgTable(
  "teacher_accounts",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    usernameUnique: uniqueIndex("teacher_accounts_username_unique").on(table.username),
  }),
);

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  role: roleEnum("role").notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const videoAccess = pgTable(
  "video_access",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    allowedSeconds: integer("allowed_seconds").notNull(),
    watchStartedAt: timestamp("watch_started_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userVideoUnique: uniqueIndex("video_access_user_video_unique").on(table.userId, table.videoId),
  }),
);

export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  backgroundColor: text("background_color").notNull().default("#f1f5f9"),
  textColor: text("text_color").notNull().default("#0f172a"),
  backgroundImageUrl: text("background_image_url").notNull().default(""),
  welcomeText: text("welcome_text").notNull().default("Welcome to the LMS"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
