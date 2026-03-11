import { Prisma, UserRole } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { OwnerShell } from "@/components/layout/owner-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FlashToast } from "@/components/ui/flash-toast";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hashPassword } from "@/lib/auth";
import { requireOwnerSession } from "@/lib/owner-session";
import { prisma } from "@/lib/prisma";

type StaffPageProps = {
  searchParams: Promise<{
    dialog?: string;
    error?: string;
    item?: string;
    status?: string;
  }>;
};

type StaffData = {
  managerCount: number;
  ownerCount: number;
  salesCount: number;
  users: Array<{
    createdAt: Date;
    email: string;
    id: string;
    role: UserRole;
  }>;
};

type StaffDialogItem = {
  createdAt: Date;
  email: string;
  id: string;
  role: UserRole;
};

type StaffDialogMode = "new" | "edit" | "delete";

const statusMessages: Record<string, string> = {
  staff_created: "Staff account created.",
  staff_deleted: "Staff account deleted.",
  staff_updated: "Staff account updated.",
};

const errorMessages: Record<string, string> = {
  duplicate_email: "Email already exists.",
  invalid_fields: "Please provide valid email, role, and password (minimum 8 characters when set).",
  invalid_role: "Invalid role value.",
  last_owner: "Cannot modify or delete the last owner account.",
  staff_in_use: "Cannot delete account with sales, shift, or inventory history.",
  user_not_found: "User not found.",
  self_delete: "You cannot delete the currently signed-in owner account.",
  self_role_change: "You cannot change your own role from this page.",
};

const createdAtFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function normalizeRole(value: FormDataEntryValue | null): UserRole | null {
  const role = String(value ?? "")
    .trim()
    .toUpperCase();

  if (role === "OWNER" || role === "MANAGER" || role === "SALES") {
    return role;
  }

  return null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function revalidateOwnerStaffRelatedPaths() {
  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/owner/staff");
}

function toDialogMode(value: string | undefined): StaffDialogMode | null {
  if (value === "new" || value === "edit" || value === "delete") {
    return value;
  }

  return null;
}

function buildStaffPageHref(input: {
  dialog?: StaffDialogMode | null;
  error?: string | null;
  item?: string | null;
  status?: string | null;
}) {
  const params = new URLSearchParams();

  if (input.dialog) {
    params.set("dialog", input.dialog);
  }

  const itemId = String(input.item ?? "").trim();
  if (input.dialog && input.dialog !== "new" && itemId) {
    params.set("item", itemId);
  }

  const error = String(input.error ?? "").trim();
  if (error) {
    params.set("error", error);
  }

  const status = String(input.status ?? "").trim();
  if (status) {
    params.set("status", status);
  }

  const search = params.toString();
  return search ? `/owner/staff?${search}` : "/owner/staff";
}

async function createStaffAction(formData: FormData) {
  "use server";

  await requireOwnerSession();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = normalizeRole(formData.get("role"));

  if (!isValidEmail(email) || password.length < 8 || !role) {
    redirect(buildStaffPageHref({ dialog: "new", error: "invalid_fields" }));
  }

  try {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role,
      },
      select: {
        id: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirect(buildStaffPageHref({ dialog: "new", error: "duplicate_email" }));
    }

    throw error;
  }

  revalidateOwnerStaffRelatedPaths();
  redirect(buildStaffPageHref({ status: "staff_created" }));
}

async function updateStaffAction(formData: FormData) {
  "use server";

  const sessionUser = await requireOwnerSession();

  const userId = String(formData.get("userId") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = normalizeRole(formData.get("role"));
  const password = String(formData.get("password") ?? "");

  if (!userId || !isValidEmail(email) || !role || (password && password.length < 8)) {
    redirect(buildStaffPageHref({ dialog: "edit", item: userId, error: "invalid_fields" }));
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      id: true,
      role: true,
    },
  });

  if (!target) {
    redirect(buildStaffPageHref({ error: "user_not_found" }));
  }

  if (target.id === sessionUser.userId && role !== target.role) {
    redirect(buildStaffPageHref({ dialog: "edit", item: userId, error: "self_role_change" }));
  }

  if (target.role === "OWNER" && role !== "OWNER") {
    const ownerCount = await prisma.user.count({
      where: { role: "OWNER" },
    });

    if (ownerCount <= 1) {
      redirect(buildStaffPageHref({ dialog: "edit", item: userId, error: "last_owner" }));
    }
  }

  const updateData: Prisma.UserUpdateInput = {
    email,
    role,
  };

  if (password.length > 0) {
    updateData.passwordHash = await hashPassword(password);
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirect(buildStaffPageHref({ dialog: "edit", item: userId, error: "duplicate_email" }));
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      redirect(buildStaffPageHref({ error: "user_not_found" }));
    }

    throw error;
  }

  revalidateOwnerStaffRelatedPaths();
  redirect(buildStaffPageHref({ status: "staff_updated" }));
}

async function deleteStaffAction(formData: FormData) {
  "use server";

  const sessionUser = await requireOwnerSession();

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    redirect(buildStaffPageHref({ error: "user_not_found" }));
  }

  if (userId === sessionUser.userId) {
    redirect(buildStaffPageHref({ dialog: "delete", item: userId, error: "self_delete" }));
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!target) {
    redirect(buildStaffPageHref({ error: "user_not_found" }));
  }

  if (target.role === "OWNER") {
    const ownerCount = await prisma.user.count({
      where: { role: "OWNER" },
    });

    if (ownerCount <= 1) {
      redirect(buildStaffPageHref({ dialog: "delete", item: userId, error: "last_owner" }));
    }
  }

  try {
    await prisma.user.delete({
      where: { id: userId },
      select: {
        id: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      redirect(buildStaffPageHref({ error: "user_not_found" }));
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2014")
    ) {
      redirect(buildStaffPageHref({ dialog: "delete", item: userId, error: "staff_in_use" }));
    }

    throw error;
  }

  revalidateOwnerStaffRelatedPaths();
  redirect(buildStaffPageHref({ status: "staff_deleted" }));
}

async function getStaffData(): Promise<StaffData> {
  try {
    const [users, ownerCount, managerCount, salesCount] = await prisma.$transaction([
      prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          email: true,
          id: true,
          role: true,
        },
      }),
      prisma.user.count({ where: { role: "OWNER" } }),
      prisma.user.count({ where: { role: "MANAGER" } }),
      prisma.user.count({ where: { role: "SALES" } }),
    ]);

    return {
      managerCount,
      ownerCount,
      salesCount,
      users,
    };
  } catch {
    return {
      managerCount: 0,
      ownerCount: 0,
      salesCount: 0,
      users: [],
    };
  }
}

async function getStaffDialogItem(userId: string): Promise<StaffDialogItem | null> {
  if (!userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      email: true,
      id: true,
      role: true,
    },
  });
}

export default async function OwnerStaffPage({ searchParams }: StaffPageProps) {
  const sessionUser = await requireOwnerSession();
  const params = await searchParams;
  const data = await getStaffData();
  const dialogMode = toDialogMode(params.dialog);
  const dialogItemId = String(params.item ?? "").trim();
  const dialogItem =
    dialogMode && dialogMode !== "new"
      ? await getStaffDialogItem(dialogItemId)
      : null;

  const openDialogHref = buildStaffPageHref({ dialog: "new" });
  const closeDialogHref = buildStaffPageHref({});

  const statusMessage = params.status ? statusMessages[params.status] : undefined;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <OwnerShell
      activeNav="staff"
      mainClassName="h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden"
      pageTitle="Staff"
      userEmail={sessionUser.email}
    >
      <FlashToast
        id={params.status ? `owner-staff-status:${params.status}` : undefined}
        message={statusMessage}
        variant="success"
      />
      <FlashToast
        id={params.error ? `owner-staff-error:${params.error}` : undefined}
        message={errorMessage}
        variant="error"
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <section className="shrink-0 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Total Staff</CardDescription>
              <CardTitle className="text-3xl">{data.users.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Owner Accounts</CardDescription>
              <CardTitle className="text-3xl">{data.ownerCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Manager Accounts</CardDescription>
              <CardTitle className="text-3xl">{data.managerCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Sales Accounts</CardDescription>
              <CardTitle className="text-3xl">{data.salesCount}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-base">Staff Directory</CardTitle>
            <CardDescription>
              Manage staff accounts with full create, update (including password), and delete controls.
            </CardDescription>
            <CardAction>
              <Button asChild>
                <Link href={openDialogHref}>Create Staff Account</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <div className="border-t" />
          <CardContent className="min-h-0 flex-1 overflow-hidden pt-4">
            <div className="h-full overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        No staff accounts available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.users.map((user) => {
                      const editHref = buildStaffPageHref({
                        dialog: "edit",
                        item: user.id,
                      });
                      const deleteHref = buildStaffPageHref({
                        dialog: "delete",
                        item: user.id,
                      });

                      return (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            {user.email}
                            {user.id === sessionUser.userId ? (
                              <Badge variant="outline" className="ml-2">
                                You
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                user.role === "OWNER"
                                  ? "default"
                                  : user.role === "MANAGER"
                                    ? "outline"
                                    : "secondary"
                              }
                            >
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">
                            {createdAtFormat.format(user.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex flex-wrap justify-end gap-2">
                              <Button asChild size="sm" variant="outline">
                                <Link href={editHref}>Edit</Link>
                              </Button>
                              {user.id === sessionUser.userId ? (
                                <Button size="sm" variant="destructive" disabled>
                                  Delete
                                </Button>
                              ) : (
                                <Button asChild size="sm" variant="destructive">
                                  <Link href={deleteHref}>Delete</Link>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {dialogMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
            {dialogMode === "new" ? (
              <>
                <div className="flex items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold">Create Staff Account</h2>
                    <p className="text-sm text-muted-foreground">
                      Add a new login and assign owner, manager, or sales role.
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={closeDialogHref}>Close</Link>
                  </Button>
                </div>
                <div className="border-t" />
                <form action={createStaffAction} className="grid grid-cols-1 gap-4 p-5">
                  <FieldGroup className="gap-4">
                    <Field className="gap-2">
                      <FieldLabel htmlFor="dialog-new-email">Email</FieldLabel>
                      <Input
                        id="dialog-new-email"
                        name="email"
                        type="email"
                        placeholder="staff@smartpos.local"
                        required
                      />
                    </Field>
                    <Field className="gap-2">
                      <FieldLabel htmlFor="dialog-new-password">Password</FieldLabel>
                      <Input
                        id="dialog-new-password"
                        name="password"
                        type="password"
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="Minimum 8 characters"
                        required
                      />
                    </Field>
                    <Field className="gap-2">
                      <FieldLabel htmlFor="dialog-new-role">Role</FieldLabel>
                      <select
                        id="dialog-new-role"
                        name="role"
                        defaultValue="SALES"
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="OWNER">Owner</option>
                        <option value="MANAGER">Manager</option>
                        <option value="SALES">Sales</option>
                      </select>
                    </Field>
                  </FieldGroup>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild type="button" variant="outline">
                      <Link href={closeDialogHref}>Cancel</Link>
                    </Button>
                    <Button type="submit">Create Account</Button>
                  </div>
                </form>
              </>
            ) : null}

            {dialogMode === "edit" ? (
              dialogItem ? (
                <>
                  <div className="flex items-start justify-between gap-3 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold">Edit Staff Account</h2>
                      <p className="text-sm text-muted-foreground">
                        Update email, role, and optionally set a new password.
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={closeDialogHref}>Close</Link>
                    </Button>
                  </div>
                  <div className="border-t" />
                  <form action={updateStaffAction} className="grid grid-cols-1 gap-4 p-5">
                    <input type="hidden" name="userId" value={dialogItem.id} />
                    <FieldGroup className="gap-4">
                      <Field className="gap-2">
                        <FieldLabel htmlFor="dialog-edit-email">Email</FieldLabel>
                        <Input
                          id="dialog-edit-email"
                          name="email"
                          type="email"
                          defaultValue={dialogItem.email}
                          required
                        />
                      </Field>
                      <Field className="gap-2">
                        <FieldLabel htmlFor="dialog-edit-role">Role</FieldLabel>
                        <select
                          id="dialog-edit-role"
                          name="role"
                          defaultValue={dialogItem.role}
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="OWNER">Owner</option>
                          <option value="MANAGER">Manager</option>
                          <option value="SALES">Sales</option>
                        </select>
                        {dialogItem.id === sessionUser.userId ? (
                          <p className="text-xs text-muted-foreground">
                            Role change is blocked for your currently signed-in account.
                          </p>
                        ) : null}
                      </Field>
                      <Field className="gap-2">
                        <FieldLabel htmlFor="dialog-edit-password">
                          New Password (Optional)
                        </FieldLabel>
                        <Input
                          id="dialog-edit-password"
                          name="password"
                          type="password"
                          minLength={8}
                          autoComplete="new-password"
                          placeholder="Leave blank to keep current password"
                        />
                      </Field>
                      <Field className="gap-2">
                        <FieldLabel>Created</FieldLabel>
                        <Input value={createdAtFormat.format(dialogItem.createdAt)} disabled />
                      </Field>
                    </FieldGroup>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button asChild type="button" variant="outline">
                        <Link href={closeDialogHref}>Cancel</Link>
                      </Button>
                      <Button type="submit">Save Changes</Button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="px-5 py-4">
                    <h2 className="text-lg font-semibold">Edit Staff Account</h2>
                    <p className="text-sm text-muted-foreground">
                      Selected account not found.
                    </p>
                  </div>
                  <div className="border-t" />
                  <div className="flex justify-end p-5">
                    <Button asChild variant="outline">
                      <Link href={closeDialogHref}>Close</Link>
                    </Button>
                  </div>
                </>
              )
            ) : null}

            {dialogMode === "delete" ? (
              dialogItem ? (
                <>
                  <div className="flex items-start justify-between gap-3 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold">Delete Staff Account</h2>
                      <p className="text-sm text-muted-foreground">
                        This action permanently removes this account.
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={closeDialogHref}>Close</Link>
                    </Button>
                  </div>
                  <div className="border-t" />
                  {dialogItem.id === sessionUser.userId ? (
                    <div className="grid grid-cols-1 gap-4 p-5">
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                        You cannot delete your own currently signed-in owner account.
                      </div>
                      <div className="flex justify-end">
                        <Button asChild variant="outline">
                          <Link href={closeDialogHref}>Close</Link>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <form action={deleteStaffAction} className="grid grid-cols-1 gap-4 p-5">
                      <input type="hidden" name="userId" value={dialogItem.id} />
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                        <p className="font-medium">{dialogItem.email}</p>
                        <p className="text-muted-foreground">Role: {dialogItem.role}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button asChild type="button" variant="outline">
                          <Link href={closeDialogHref}>Cancel</Link>
                        </Button>
                        <Button type="submit" variant="destructive">
                          Confirm Delete
                        </Button>
                      </div>
                    </form>
                  )}
                </>
              ) : (
                <>
                  <div className="px-5 py-4">
                    <h2 className="text-lg font-semibold">Delete Staff Account</h2>
                    <p className="text-sm text-muted-foreground">
                      Selected account not found.
                    </p>
                  </div>
                  <div className="border-t" />
                  <div className="flex justify-end p-5">
                    <Button asChild variant="outline">
                      <Link href={closeDialogHref}>Close</Link>
                    </Button>
                  </div>
                </>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </OwnerShell>
  );
}
