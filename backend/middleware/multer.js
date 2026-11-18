import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import AppError from '../utils/AppError.js'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
// Extension is derived from the validated mimetype, never from the client filename.
const ALLOWED_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
}

let storage = multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null,"./public")
    },
    filename:(req,file,cb)=>{
        cb(null, crypto.randomUUID() + ALLOWED_TYPES[file.mimetype]);
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const extOk = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)
    if (!ALLOWED_TYPES[file.mimetype] || !extOk) {
        return cb(new AppError('Only JPEG, PNG or WebP images are allowed', 400))
    }
    cb(null, true)
}

let upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE, files: 4 } })

export default upload
