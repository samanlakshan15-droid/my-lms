"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sessions, siteSettings, teacherAccounts, users, videoAccess, videos } from "@/db/schema";
import {
  DEFAULT_TEACHER_PASSWORD,
  DEFAULT_TEACHER_USERNAME,
  createSession,
  destroySession,
  hashPassword,
  requireTeacherSession,
  verifyPassword,
} from "@/lib/auth";
import { extractYoutubeId } from "@/lib/youtube";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function positiveInt(input: string) {
  const parsed = Number.parseInt(input, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function signupAction(formData: FormData) {
  const fullName = value(formData, "fullName");
  const idNo = value(formData, "idNo");
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");

  if (!fullName || !idNo || !email || !password || password.length < 6) {
    redirect("/signup?error=Please+fill+all+fields+(password+min+6)");
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), eq(users.idNo, idNo)));

  if (existing.length > 0) {
    redirect("/signup?error=User+already+exists");
  }

  const [duplicateByEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (duplicateByEmail) {
    redirect("/signup?error=Email+already+registered");
  }

  const [duplicateByIdNo] = await db.select({ id: users.id }).from(users).where(eq(users.idNo, idNo)).limit(1);
  if (duplicateByIdNo) {
    redirect("/signup?error=ID+number+already+registered");
  }

  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    fullName,
    idNo,
    email,
    passwordHash,
  });

  redirect("/login?success=Account+created.+Please+login");
}

export async function loginUserAction(formData: FormData) {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    redirect("/login?error=Invalid+credentials");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    redirect("/login?error=Invalid+credentials");
  }

  await createSession("user", user.id);
  redirect("/dashboard");
}

export async function loginAdminAction(formData: FormData) {
  const username = value(formData, "username");
  const password = value(formData, "password");

  const isDefaultTeacher =
    username === DEFAULT_TEACHER_USERNAME && password === DEFAULT_TEACHER_PASSWORD;

  if (!isDefaultTeacher) {
    const [teacher] = await db.select().from(teacherAccounts).where(eq(teacherAccounts.username, username)).limit(1);

    if (!teacher) {
      redirect("/admin/login?error=Invalid+teacher+credentials");
    }

    const valid = await verifyPassword(password, teacher.passwordHash);
    if (!valid) {
      redirect("/admin/login?error=Invalid+teacher+credentials");
    }
  }

  await createSession("admin");
  redirect("/admin");
}

export async function createTeacherAccountAction(formData: FormData) {
  await requireTeacherSession();

  const username = value(formData, "username");
  const password = value(formData, "password");

  if (!username || !password || password.length < 6) {
    redirect("/admin?error=Teacher+username+and+password+(min+6)+are+required");
  }

  if (username === DEFAULT_TEACHER_USERNAME) {
    redirect("/admin?error=This+username+is+reserved");
  }

  const [exists] = await db
    .select({ id: teacherAccounts.id })
    .from(teacherAccounts)
    .where(eq(teacherAccounts.username, username))
    .limit(1);

  if (exists) {
    redirect("/admin?error=Teacher+username+already+exists");
  }

  const passwordHash = await hashPassword(password);
  await db.insert(teacherAccounts).values({ username, passwordHash });

  revalidatePath("/admin");
  redirect("/admin?success=Teacher+login+created");
}

export async function removeTeacherAccountAction(formData: FormData) {
  await requireTeacherSession();

  const teacherId = positiveInt(value(formData, "teacherId"));
  if (!teacherId) {
    redirect("/admin?error=Invalid+teacher+account");
  }

  await db.delete(teacherAccounts).where(eq(teacherAccounts.id, teacherId));

  revalidatePath("/admin");
  redirect("/admin?success=Teacher+account+removed");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function createVideoAction(formData: FormData) {
  await requireTeacherSession();

  const title = value(formData, "title");
  const youtubeUrl = value(formData, "youtubeUrl");

  if (!title || !youtubeUrl) {
    redirect("/admin?error=Video+title+and+YouTube+link+are+required");
  }

  const videoId = extractYoutubeId(youtubeUrl);
  if (!videoId) {
    redirect("/admin?error=Invalid+YouTube+URL+or+Video+ID");
  }

  await db.insert(videos).values({ title, youtubeUrl });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?success=Video+added");
}

export async function updateVideoAction(formData: FormData) {
  await requireTeacherSession();

  const videoIdValue = positiveInt(value(formData, "videoId"));
  const title = value(formData, "title");
  const youtubeUrl = value(formData, "youtubeUrl");

  if (!videoIdValue || !title || !youtubeUrl) {
    redirect("/admin?error=Invalid+video+update+data");
  }

  const parsed = extractYoutubeId(youtubeUrl);
  if (!parsed) {
    redirect("/admin?error=Invalid+YouTube+URL+or+Video+ID");
  }

  await db
    .update(videos)
    .set({ title, youtubeUrl })
    .where(eq(videos.id, videoIdValue));

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?success=Video+updated");
}

export async function grantVideoAccessAction(formData: FormData) {
  await requireTeacherSession();

  const userId = positiveInt(value(formData, "userId"));
  const videoId = positiveInt(value(formData, "videoId"));
  const minutes = positiveInt(value(formData, "minutes"));

  if (!userId || !videoId || !minutes) {
    redirect("/admin?error=User,+video,+and+minutes+are+required");
  }

  const extraSeconds = minutes * 60;
  const now = new Date();

  const [existing] = await db
    .select()
    .from(videoAccess)
    .where(and(eq(videoAccess.userId, userId), eq(videoAccess.videoId, videoId)))
    .limit(1);

  if (!existing) {
    await db.insert(videoAccess).values({
      userId,
      videoId,
      allowedSeconds: extraSeconds,
      usedSeconds: 0,
      updatedAt: now,
    });
  } else {
    await db
      .update(videoAccess)
      .set({
        allowedSeconds: existing.allowedSeconds + extraSeconds,
        updatedAt: now,
      })
      .where(eq(videoAccess.id, existing.id));
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?success=Access+updated");
}

export async function removeVideoAccessAction(formData: FormData) {
  await requireTeacherSession();

  const accessId = positiveInt(value(formData, "accessId"));
  if (!accessId) {
    redirect("/admin?error=Invalid+access+record");
  }

  await db.delete(videoAccess).where(eq(videoAccess.id, accessId));

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?success=User+video+access+removed");
}

export async function removeUserAction(formData: FormData) {
  await requireTeacherSession();

  const userId = positiveInt(value(formData, "userId"));
  if (!userId) {
    redirect("/admin?error=Invalid+user+record");
  }

  await db.delete(users).where(eq(users.id, userId));

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?success=User+removed+successfully");
}

export async function removeVideoAction(formData: FormData) {
  await requireTeacherSession();

  const videoId = positiveInt(value(formData, "videoId"));
  if (!videoId) {
    redirect("/admin?error=Invalid+video+record");
  }

  await db.delete(videos).where(eq(videos.id, videoId));

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?success=Video+removed+successfully");
}

export async function updateSiteSettingsAction(formData: FormData) {
  await requireTeacherSession();

  const backgroundColor = value(formData, "backgroundColor") || "#f1f5f9";
  const textColor = value(formData, "textColor") || "#0f172a";
  const backgroundImageUrl = value(formData, "backgroundImageUrl");
  const welcomeText = value(formData, "welcomeText") || "Welcome to the LMS";

  await db
    .update(siteSettings)
    .set({
      backgroundColor,
      textColor,
      backgroundImageUrl,
      welcomeText,
      updatedAt: new Date(),
    })
    .where(eq(siteSettings.id, 1));

  revalidatePath("/", "layout");
  revalidatePath("/admin");
  redirect("/admin?success=Site+theme+updated");
}

export async function cleanupExpiredSessionsAction() {
  await requireTeacherSession();
  await db.delete(sessions).where(eq(sessions.role, "user"));
  revalidatePath("/admin");
}
