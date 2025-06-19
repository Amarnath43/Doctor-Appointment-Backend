const multer=require('multer');
const path=require('path');

const storage=multer.diskStorage({
    destination: (req,file,cb)=>{
        cb(null, path.join(__dirname, '..','uploads','profile'))
    },
    filename: (req,file,cb)=>{
        cb(null, Date.now()+path.extname(file.originalname))
    }
});

const fileFilter=(req,file,cb)=>{
if(file.mimetype.startsWith('image/'))
{
    cb(null,true)
}
else{
    cb(new Error('Not an image'))
}
}

const upload=multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1024*1024*5
    }
});

module.exports=upload;



/*
Step	Action
1	User uploads file via form/API
2	Multer reads file headers (e.g. originalname, mimetype, etc.) from the stream
3	Multer builds an internal file object with those details
4	Multer calls destination(req, file, cb) and filename(req, file, cb) using that object
5	Multer writes the file to disk using the returned location and name
6	Multer sets req.file with full info (now includes final path, filename, size, etc.)
7	Your route handler runs (e.g., console.log(req.file))
*/


/*
📌 1. What is file?
The file parameter in your filename() or fileFilter() function is:

A temporary in-memory object created by Multer while it is processing the incoming uploaded file.

You access it here:

filename: (req, file, cb) => { ... }
fileFilter: (req, file, cb) => { ... }
At this point, the file:

Has not been saved to disk yet

Exists only as metadata, like:
{
  fieldname: 'photo',
  originalname: 'dog.jpg',
  mimetype: 'image/jpeg',
  encoding: '7bit'
  // path, size, filename etc. are not finalized yet
}
*/