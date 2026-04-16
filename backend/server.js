require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const session = require("express-session");
const OpenAI = require("openai");
const app = express();
app.use(cors());
app.use(express.json());
app.use(session({
  secret: "learnhubsecret",
  resave: false,
  saveUninitialized: true
}));
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/uploads", express.static(path.join(__dirname,"uploads")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

/* ===== MongoDB ===== */
if(process.env.MONGODB_URI){
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log(err));
} else {
  console.log("MongoDB not connected (Render mode)");
}
/* ===== MODELS ===== */
const User = mongoose.model("User", {
	name: String,
	email: String,
	password: String
});

const Material = mongoose.model("Material", {
  title: String,
  subject: String,
  tags: [String],
  file: String,
  downloads: { type: Number, default: 0 },
  deleted: { type: Boolean, default: false },
  uploader: String,
  favorites: [String]   // users who favorited
});

const Message = mongoose.model("Message", {
  user: String,
  message: String
});
/* ===== ONLINE USERS ===== */
let onlineUsers = new Set();

/* ===== FILE STORAGE ===== */
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
	filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

/* ===== REGISTER ===== */
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  if(!name || !email || !password)
    return res.status(400).send("Enter name, email & password");

  const existing = await User.findOne({ email });
  if(existing)
    return res.status(400).send("User already exists");

  await new User({ name, email, password }).save();
  res.send("Registered Successfully");
});


/* ===== LOGIN ===== */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if(!user) return res.status(401).send("Invalid login");

  if(user.password !== password)
    return res.status(401).send("Invalid login");

  req.session.userEmail = user.email;

  onlineUsers.add(email);

  res.json({
    message: "Login successful",
    name: user.name,
    email: user.email
  });
});
app.post("/logout", (req, res) => {
  const { email } = req.body;

  if(email){
    onlineUsers.delete(email);
  }

  req.session.destroy(() => {
    res.send("Logged out");
  });
});
/* ===== ADD MATERIAL ===== */
app.post("/add-material", upload.single("file"), async (req, res) => {
  try {
    const material = new Material({
      title: req.body.title,
      subject: req.body.subject,
      tags: JSON.parse(req.body.tags),
      file: req.file.filename,
      uploader: req.body.uploader
    });

    await material.save();
    res.send("Material Uploaded");
  } catch {
    res.status(500).send("Upload Error");
  }
});

/* ===== MATERIALS ===== */
app.get("/materials", async (req, res) => {
  const materials = await Material.find({ deleted:false }).sort({_id:-1});
  res.json(materials);
});
/* ===== SEARCH MATERIAL ===== */
app.get("/search", async (req, res) => {

  const query = req.query.q;

  const results = await Material.find({
    deleted:false,
    $or: [
      { title: { $regex: query, $options: "i" } },
      { subject: { $regex: query, $options: "i" } },
      { tags: { $regex: query, $options: "i" } }
    ]
  });

  res.json(results);

});

app.get("/file/:id", async (req, res) => {
  try {
    const mat = await Material.findById(req.params.id);

    if (!mat || mat.deleted) {
      return res.status(404).send("File not found");
    }

    res.sendFile(path.join(__dirname, "uploads", mat.file));
  } catch (err) {
    res.status(500).send("Preview error");
  }
});
app.get("/download/:id", async (req, res) => {
  try {
    const mat = await Material.findById(req.params.id);

    if (!mat || mat.deleted) {
      return res.status(404).send("File not found");
    }

    mat.downloads += 1;
    await mat.save();

    res.download(path.join(__dirname, "uploads", mat.file));
  } catch (err) {
    res.status(500).send("Download error");
  }
});
/* ===== DELETE ===== */
app.delete("/delete/:id", async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);

    if (!material) {
      return res.status(404).send("Material not found");
    }

    const email = req.query.email;

    if (material.uploader !== email) {
      return res.status(403).send("You can delete only your own material");
    }

    await Material.findByIdAndUpdate(req.params.id, { deleted: true });

    res.send("Material Deleted");
  } catch (err) {
    res.status(500).send("Delete error");
  }
});

/* ===== MY UPLOADS ===== */
app.get("/my-uploads/:email", async (req, res) => {
  const count = await Material.countDocuments({
    uploader: req.params.email,
    deleted:false
  });

  res.json({ count });
});

/* ===== STATS ===== */
app.get("/stats", async (req, res) => {
  const data = await Material.find({ deleted:false });

  const totalMaterials = data.length;
  const totalDownloads = data.reduce((sum, m) => sum + m.downloads, 0);

  res.json({ totalMaterials, totalDownloads });
});
/* ===== ADD MESSAGE ===== */
app.post("/add-message", async (req, res) => {

const { user, message } = req.body;

if(!message) return res.status(400).send("Message required");

await new Message({ user, message }).save();

res.send("Message Added");

});
/* ===== GET MESSAGES ===== */
app.get("/messages", async (req, res) => {

const msgs = await Message.find().sort({_id:-1});

res.json(msgs);

});
app.get("/online-users", (req,res)=>{
  res.json({count: onlineUsers.size});
});
app.listen(process.env.PORT || 5000, () => {
  console.log("Server running on port 5000");
});
/* ===== DELETE MESSAGE ===== */
app.delete("/delete-message/:id", async (req, res) => {

try{

console.log("Deleting message:", req.params.id);

await Message.findByIdAndDelete(req.params.id);

res.send("Message Deleted");

}
catch(err){

console.log(err);

res.status(500).send("Delete Error");

}

});

/* ===== TOP DOWNLOADED MATERIALS ===== */

app.get("/top-materials", async (req,res)=>{

let top = await Material.find({ deleted: false }).sort({ downloads: -1 }).limit(5);
res.json(top);

});
/* ===== DELETE MATERIAL ===== */
/*app.delete("/delete-material/:id", async (req, res) => {

try{

await Material.findByIdAndDelete(req.params.id);

res.send("Material Deleted");

}
catch(err){
res.status(500).send("Delete Error");
}

}); */
/* ===== AI CHATBOT ===== */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/ai-chat", async (req, res) => {

try {

const { message } = req.body;

const completion = await openai.chat.completions.create({
model: "gpt-4o-mini",
messages: [{ role: "user", content: message }]
});

const reply = completion.choices[0].message.content;

res.json({ reply });

} catch (error) {

console.log(error);

res.json({ reply: "AI error occurred" });

}

});

/* ===== RECENT MATERIALS ===== */
app.get("/recent-materials", async (req,res)=>{

let recent = await Material.find({deleted:false})
.sort({_id:-1})
.limit(5);

res.json(recent);

});
/* ===== FAVORITE MATERIAL ===== */
app.post("/favorite/:id", async (req,res)=>{

  const email = req.body.email;
  const id = req.params.id;

  let mat = await Material.findById(id);

  if(!mat){
    return res.status(404).json({msg:"Material not found"});
  }

  if(!mat.favorites){
    mat.favorites = [];
  }

  if(mat.favorites.includes(email)){
    mat.favorites = mat.favorites.filter(favEmail => favEmail !== email);
    await mat.save();
    return res.json({msg:"Removed from favorites", isFavorite:false});
  } else {
    mat.favorites.push(email);
    await mat.save();
    return res.json({msg:"Added to favorites", isFavorite:true});
  }

});

/* ===== GET FAVORITES ===== */
app.get("/my-favorites/:email", async (req, res) => {
  let fav = await Material.find({
    favorites: req.params.email,
    deleted: false
  });

  res.json(fav);
});
/* ===== LEADERBOARD ===== */
app.get("/leaderboard", async (req,res)=>{
  let board = await Material.aggregate([
    {
      $match: { deleted: false }
    },
    {
      $group:{
        _id:"$uploader",
        uploads:{$sum:1}
      }
    },
    {
      $sort:{uploads:-1}
    },
    {
      $limit:5
    }
  ]);

  res.json(board);
});