import { redirect } from "next/navigation";
import { getChatGPTUser } from "../chatgpt-auth";
import type { Client, UserRole, WorkspaceUser } from "./types";

const demoUser: WorkspaceUser = {
  displayName: "Lokaler Preview-Admin",
  email: "owner@hsp.local",
  role: "owner",
};

export async function requireWorkspaceUser(returnTo: string) {
  const user = await getWorkspaceUser();
  if (user) return user;

  redirect(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
}

export async function getWorkspaceUser(): Promise<WorkspaceUser | null> {
  const chatGPTUser = await getChatGPTUser();
  if (!chatGPTUser && process.env.NODE_ENV !== "production") {
    return demoUser;
  }
  if (!chatGPTUser) return null;

  return {
    displayName: chatGPTUser.displayName,
    email: chatGPTUser.email,
    role: getRoleForEmail(chatGPTUser.email),
  };
}

export function canAccessCockpit(user: WorkspaceUser) {
  return user.role === "owner" || user.role === "admin";
}

export function canAccessClient(user: WorkspaceUser, client: Client) {
  if (canAccessCockpit(user)) return true;
  return client.authorizedUsers
    .map((email) => email.toLowerCase())
    .includes(user.email.toLowerCase());
}

export function requireCockpitAccess(user: WorkspaceUser) {
  if (!canAccessCockpit(user)) {
    redirect("/zugriff-verweigert");
  }
}

function getRoleForEmail(email: string): UserRole {
  const adminEmails = parseEmailList(process.env.APP_ADMIN_EMAILS);
  const ownerEmails = parseEmailList(process.env.APP_OWNER_EMAILS);
  const normalizedEmail = email.toLowerCase();

  if (ownerEmails.includes(normalizedEmail)) return "owner";
  if (adminEmails.includes(normalizedEmail)) return "admin";
  if (ownerEmails.length === 0 && adminEmails.length === 0) return "admin";
  return "restricted";
}

function parseEmailList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}
