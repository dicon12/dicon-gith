# DICON GITH Admin Guide

How to run the Grassroots Innovations Talent Hunt platform day to day

This guide is for DICON administrators. Sign in at **/admin** with an admin account. The first time you open a page on a device, a short highlighted-button tour shows you around; it never appears again on that device. To see it again, add **?tour=1** to the page address.

## Who can do what

| Role | What they can do |
|---|---|
| super_admin | Everything an admin can, plus giving roles to other people. |
| admin | Reviews applications, assigns evaluators and mentors, publishes events, announcements and showcase entries, handles partners and sponsor matching. |
| evaluator | Sees only the innovations assigned to them (name and location, no contact details) and fills a score sheet. |
| mentor | Sees only the innovations assigned to them and adds guidance notes. |
| innovator | Submits and tracks their own applications. |

## 1. Review and move applications

1. Open **Applications** in the left menu. Tap **New Submissions** to see what has just arrived.
2. Tap an application. Read the sections. Under attachments, every photo, document and video has a **View** button (opens on the page) and a **Download** button. Word files can only be downloaded. Video links such as YouTube open in a new tab.
3. Type a note in **Administrative Evaluation Note**. A note is required for Return, Reject and Recommend.
4. Use the buttons at the bottom to move it: **Move to Screening**, then **Move to Verification**, then **Move to Assessment**.
5. Use **Recommend Innovation** to shortlist it, and **Approve for Support** for the final selection.
6. Use **Return for Correction** if the innovator must fix something (they can edit and resubmit), or **Reject Submission** to close it.
7. Every move is saved in the status history and the innovator gets a notification (and an email if Brevo is set up).

## 2. Assign at least two evaluators to each innovation

1. First make sure your evaluators have the role (see section 8).
2. Open **Evaluation Workspace** then the **Assign evaluators** tab. Innovations in Verification or Assessment are listed.
3. For each innovation pick an evaluator, choose an optional due date and tap **Assign**. Repeat until **at least two** evaluators are on it.
4. When enough are assigned, tap the button to move the innovation to Assessment.
5. Follow progress in **Results & shortlist**. It shows who has submitted and who is still in draft. Tap **reopen** if an evaluator needs to correct a submitted sheet.
6. Tick innovations with at least two submitted sheets and tap **Shortlist selected** or **Select (final)**. Use **Export ranking (CSV)** for a copy.

Use the **Verification** tab to record contact or site-visit notes (private to administrators), then **Save & move to assessment**. Agree the scoring weights with the GITH panel in the **Evaluators & weights** tab.

## 3. Publish events

1. Evaluation Workspace, **Events** tab.
2. Fill in title, date, location and description.
3. Tick **Published (visible to innovators)** and tap **Save event**.
4. Later you can **Unpublish** or **Delete** it from the list. An unticked event stays a draft.

## 4. Send announcements

1. Evaluation Workspace, **Announcements** tab.
2. Write a title (up to 100 characters) and a message (up to 500).
3. Choose who gets it: all innovators, those with submissions, shortlisted, or selected.
4. Tap **Send**. Each person gets an in-app notification.

## 5. Handle partner requests and sponsor matching

1. Open **Partner Requests**. New requests from the Partner With Us page appear here.
2. Tap a request. Read it, set the status (New, Contacted, In discussion, Partnered or Declined), add notes and tap **Save changes**.
3. Open an approved or recommended application and use the sponsor tag button to put it forward to sponsors. Only recommended or approved innovations can be put forward.
4. Open **Sponsor Matching**. For each innovation put forward, interested partners are suggested by matching category and state. Record an introduction when you connect them.
5. Share only what the innovator agreed to. Never pass on contact details without their consent.

## 6. Add mentors

1. Give the person the **mentor** role first (section 8).
2. Evaluation Workspace, **Mentors** tab. Selected, mentorship and incubation innovations are listed.
3. Pick a mentor from **Add mentor** and add them. A warning mark appears if there may be a conflict of interest.
4. Remove a mentor with the cross next to their name. Mentors see only the innovations assigned to them.

## 7. Add showcase entries

1. Evaluation Workspace, **Showcase** tab. Selected, mentorship and incubation innovations are listed.
2. Write a short public summary (20 to 400 characters). Do not include contact details.
3. Tick **The innovator has given consent to be shown publicly**. Publishing is blocked until you do.
4. Tap **Publish**. It appears on the public Showcase page. Use **Remove from showcase** to take it down.

## 8. Give roles

1. Only a **super_admin** can do this.
2. The person must already have registered an account.
3. Evaluation Workspace, **Evaluators & weights** tab, **Give a role**.
4. Type their registered email, choose evaluator, mentor, innovator or admin, and tap **Set role**.
5. Ask them to sign out and sign in again. Nobody can change their own role.

## Other things to know

- **Policies and content:** the Privacy Policy, Terms and About text can be edited under **System Policies & Content**. Paste DICON's approved text there and save; no code change is needed.
- **Files are private:** innovation photos and documents open only for the owner, admins, evaluators and mentors, through links that expire after about an hour.
- **Backups:** see the Cost Note and BACKUP_AND_ALERTS.md for the Firebase settings.
- **Shared devices:** always sign out when you finish.
