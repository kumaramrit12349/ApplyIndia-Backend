import { Router } from "express";
import { authenticateTokenAndEmail, requireRole } from "../../middlewares/authMiddleware";
import {
  listContactsForAdmin,
  listArchivedContacts,
  getContactBySk,
  updateContactStatus,
  updateContactPriority,
  setContactSpam,
  softDeleteContact,
  restoreContact,
  addInternalNote,
  getInternalNotes,
  sendContactReply,
  getContactReplies,
  getContactStats,
  permanentlyDeleteContact,
  bulkPermanentlyDeleteContacts,
  bulkSoftDeleteContacts,
} from "../../services/private/contactAdminService";
import { CONTACT_STATUS } from "../../db_schema/Contact/ContactConstant";
import { getUserProfile } from "../../services/authService";

/** Access-token claims only reliably carry `sub` — resolve a display name from the stored profile for notes/replies. */
async function resolveAdminName(sub: string): Promise<string | undefined> {
  const profile = await getUserProfile(sub).catch(() => null);
  if (!profile) return undefined;
  return `${profile.given_name || ""} ${profile.family_name || ""}`.trim() || undefined;
}

const router = Router();
router.use(authenticateTokenAndEmail);
// V1: no tiered permissions — the entire Contact Us admin module is Admin-only.
router.use(requireRole("admin"));

const ERROR_STATUS_MAP: Record<string, number> = {
  CONTACT_NOT_FOUND: 404,
};

function respondError(res: any, error: any, fallback: string) {
  console.error(error);
  const msg = error?.message || fallback;
  res.status(ERROR_STATUS_MAP[msg] || 400).json({ success: false, error: msg });
}

// POST /api/contact/list  { search?, searchField?, category?, status?, priority?, is_spam?, dateFrom?, dateTo?, limit?, startKey? }
router.post("/list", async (req, res) => {
  try {
    const { search, searchField, category, status, priority, is_spam, dateFrom, dateTo, limit = 30, startKey } = req.body;
    const data = await listContactsForAdmin({ search, searchField, category, status, priority, is_spam, dateFrom, dateTo, limit, startKey });
    res.json({ success: true, ...data });
  } catch (error) {
    respondError(res, error, "Failed to list contacts");
  }
});

// POST /api/contact/trash/list
router.post("/trash/list", async (_req, res) => {
  try {
    const results = await listArchivedContacts();
    res.json({ success: true, results });
  } catch (error) {
    respondError(res, error, "Failed to list trashed contacts");
  }
});

// GET /api/contact/stats
router.get("/stats", async (_req, res) => {
  try {
    const stats = await getContactStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    respondError(res, error, "Failed to fetch contact stats");
  }
});

// GET /api/contact/:id
router.get("/:id", async (req, res) => {
  try {
    const contact = await getContactBySk(decodeURIComponent(req.params.id));
    if (!contact) return res.status(404).json({ success: false, error: "CONTACT_NOT_FOUND" });
    res.json({ success: true, data: contact });
  } catch (error) {
    respondError(res, error, "Failed to fetch contact");
  }
});

// PATCH /api/contact/:id/status  { status }
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!Object.values(CONTACT_STATUS).includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }
    await updateContactStatus(decodeURIComponent(req.params.id), status);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to update status");
  }
});

// PATCH /api/contact/:id/priority  { priority }
router.patch("/:id/priority", async (req, res) => {
  try {
    await updateContactPriority(decodeURIComponent(req.params.id), req.body.priority);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to update priority");
  }
});

// GET /api/contact/:id/notes
router.get("/:id/notes", async (req, res) => {
  try {
    const notes = await getInternalNotes(decodeURIComponent(req.params.id));
    res.json({ success: true, data: notes });
  } catch (error) {
    respondError(res, error, "Failed to fetch notes");
  }
});

// POST /api/contact/:id/notes  { body }
router.post("/:id/notes", async (req, res) => {
  try {
    const adminSub = (req as any).user?.sub;
    const adminName = await resolveAdminName(adminSub);
    const note = await addInternalNote(decodeURIComponent(req.params.id), adminSub, adminName, req.body.body);
    res.json({ success: true, data: note });
  } catch (error) {
    respondError(res, error, "Failed to add note");
  }
});

// GET /api/contact/:id/replies
router.get("/:id/replies", async (req, res) => {
  try {
    const replies = await getContactReplies(decodeURIComponent(req.params.id));
    res.json({ success: true, data: replies });
  } catch (error) {
    respondError(res, error, "Failed to fetch replies");
  }
});

// POST /api/contact/:id/replies  { body }
router.post("/:id/replies", async (req, res) => {
  try {
    const adminSub = (req as any).user?.sub;
    const adminName = await resolveAdminName(adminSub);
    const reply = await sendContactReply(decodeURIComponent(req.params.id), adminSub, adminName, req.body.body);
    res.json({ success: true, data: reply });
  } catch (error) {
    respondError(res, error, "Failed to send reply");
  }
});

// POST /api/contact/:id/spam  { is_spam }
router.post("/:id/spam", async (req, res) => {
  try {
    await setContactSpam(decodeURIComponent(req.params.id), !!req.body.is_spam);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to update spam flag");
  }
});

// POST /api/contact/:id/delete
router.post("/:id/delete", async (req, res) => {
  try {
    await softDeleteContact(decodeURIComponent(req.params.id));
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to delete contact");
  }
});

// POST /api/contact/:id/restore
router.post("/:id/restore", async (req, res) => {
  try {
    await restoreContact(decodeURIComponent(req.params.id));
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to restore contact");
  }
});

// POST /api/contact/bulk-delete  { ids: string[] }  — bulk move-to-trash (soft delete)
router.post("/bulk-delete", async (req, res) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await bulkSoftDeleteContacts(ids.map((id) => decodeURIComponent(id)));
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to move contacts to trash");
  }
});

// DELETE /api/contact/bulk-permanent-delete  { ids: string[] }
// Registered before "/:id/permanent" only as a matter of file order — the
// distinct literal path means there's no actual routing ambiguity between
// the two, but grouping bulk-before-single mirrors notification.ts.
router.delete("/bulk-permanent-delete", async (req, res) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await bulkPermanentlyDeleteContacts(ids.map((id) => decodeURIComponent(id)));
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to permanently delete contacts");
  }
});

// DELETE /api/contact/:id/permanent
router.delete("/:id/permanent", async (req, res) => {
  try {
    await permanentlyDeleteContact(decodeURIComponent(req.params.id));
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to permanently delete contact");
  }
});

export default router;
