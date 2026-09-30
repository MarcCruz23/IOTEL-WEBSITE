// Exact domain matching rejects Yahoo and misspellings such as gmail.con.
// Verification email is still required to prove ownership of the mailbox.
function isGmailAddress(value) {
    if (typeof value !== "string") return false;
    const email = value.trim().toLowerCase();
    const parts = email.split("@");
    if (parts.length !== 2 || parts[1] !== "gmail.com") return false;
    const local = parts[0];
    return local.length > 0 && local.length <= 64
        && /^[a-z0-9]+(?:\.[a-z0-9]+)*(?:\+[a-z0-9._-]+)?$/.test(local);
}

module.exports = { isGmailAddress };
