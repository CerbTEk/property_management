# Team roster, assignments and in-app reminders

The owner can add, edit, deactivate and reactivate roster entries with the roles cleaner, inspector, maintenance and assistant. Roles are descriptive only: a roster entry is not an auth account, membership, invitation or permission grant. No external notifications are sent.

Active owned people can be assigned to open/in-progress tasks. Cleaning and inspection defaults are per listing and task type; they apply to new tasks, including manually prepared tasks for existing bookings. Tasks created before this release remain unassigned. Default changes never reassign existing work. Deactivating a default person makes new tasks unassigned; existing assignments remain visible for host review.

Assignment names are server-controlled snapshots. Editing someone's roster name does not rewrite old task history. Completed/dismissed tasks must be reopened before their assignment can change. Unassigning an existing task does not reapply its default. RLS, composite owner foreign keys, active-person validation and stale-update comparisons protect the records. Hosts cannot delete roster or assignment history.

Operations adds Unassigned and Next seven days filters. Inactive/unavailable people count as requiring assignment and review. Overview summarizes overdue, due-today, unassigned and upcoming work, with links to Operations. Local calendar dates use each listing's timezone and seven-day calculations do not assume every local day has 24 elapsed hours. Counts can overlap: one task may be overdue and unassigned. Reminder clocks refresh every 30 seconds while the workspace is open; fetching changed task data still requires Refresh or navigation/reload.

Pending: team invitations, independent staff task access, property-scoped permissions, assignment acceptance, email/SMS/push delivery and notification receipt history. Do not treat a saved assignment as proof someone received or accepted it.
