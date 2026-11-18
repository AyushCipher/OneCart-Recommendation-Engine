import jwt from 'jsonwebtoken'

// Admin identity is the single ADMIN_EMAIL from the environment. adminLogin
// issues a token carrying { email }; user tokens carry { userId } instead, so a
// valid customer token can never satisfy this check. Fails closed when
// ADMIN_EMAIL is not configured.
const adminAuth = async (req, res, next) => {
    try {
        const adminEmail = process.env.ADMIN_EMAIL
        const token = req.cookies?.token

        if (!token) {
            return res.status(401).json({ message: "Not Authorized! Login Again" })
        }
        if (!adminEmail) {
            return res.status(403).json({ message: "Admin access is not configured" })
        }

        let decoded
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET)
        } catch (err) {
            return res.status(401).json({ message: "Not Authorized! Login Again, Invalid token" })
        }

        if (
            typeof decoded?.email !== 'string' ||
            decoded.email.toLowerCase() !== adminEmail.toLowerCase()
        ) {
            return res.status(403).json({ message: "Admin access required" })
        }

        req.adminEmail = adminEmail
        next()
    } catch (error) {
        console.log("adminAuth error:", error.message)
        return res.status(500).json({ message: "adminAuth error" })
    }
}

export default adminAuth
