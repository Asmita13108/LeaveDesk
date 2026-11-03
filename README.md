# LeaveDesk

Employee Leave Management System built using the MERN stack.

## Technologies
- React
- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication

## Features
- Employee signup and login
- Employee or manager role selection during signup; manager signup requires a server-side invite code
- Apply for leave
- View leave history
- Cancel pending leave requests
- Manager approval and rejection
- Leave dashboard and balance tracking
- Leave balance calculation excludes weekends and India's national holidays (January 26, August 15, and October 2)
- Leave requests are limited by each leave type's annual balance; pending requests reserve days until approved, rejected, or cancelled
- Prevent overlapping leave requests while an existing request is pending or approved
- Employee and manager leave summary APIs for annual balance overview
- Managers can assign employees to any manager from the team directory; leave requests and team summaries are scoped to assigned employees

## Project Status
Initial setup in progress.

## Manager signup
Set `MANAGER_INVITE_CODE` in `server/.env` to a long, unique secret before creating manager accounts, then restart the server. Enter that code in the signup form after selecting the Manager role. Keep the code private and never add it to the client configuration. Employee signups do not need an invite code.

## Employee manager assignment
Managers can assign or reassign employees from the Team Directory. An employee must have an active manager assignment before submitting leave requests. Managers can only view and review requests, and see leave summaries, for employees assigned to them. Assign existing employees before they apply for leave.

## Email notifications
Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `server/.env`, then restart the server. Copy the variable names and example values from `server/.env.example`, and replace them with credentials from your SMTP provider. For Gmail, use an app password rather than your regular account password. Keep SMTP credentials private and never add them to the client. Assigned managers receive emails for submitted or cancelled requests; employees receive an email after their assigned manager approves or rejects a request. Missing or failed SMTP delivery is logged by the server and does not undo a leave request.
