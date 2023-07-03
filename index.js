require("dotenv").config();
const express = require("express");
const app = express();
app.use(express.json());
const cors = require("cors");
app.use(cors());

const isProduction = process.env.NODE_ENV === "production";

const bcrypt = require("bcrypt"); //For password encryption

const jwt = require("jsonwebtoken");
const JWT_secret = process.env.JWT_SECRET;

app.set("view engine", "ejs"); //For representing node UI

app.use(express.urlencoded({ extended: false }));

const nodemailer = require("nodemailer");

const multer = require("multer"); //For updloading image
const upload = multer();

//Declaring port

app.listen(3000, () => {
  console.log("server started on port 3000");
});

//MongoDB connection

const mongoose = require("mongoose");
const mongoUrl = isProduction
  ? process.env.DATABASE_URL
  : "mongodb://0.0.0.0:27017/";

mongoose
  .connect(mongoUrl, {
    useNewUrlParser: true,
  })
  .then(() => {
    console.log("connected to Database");
  })
  .catch((e) => console.log(e));

//Importing User schema
require("./models/Schema.js");
const User = mongoose.model("userInfo");

//Register API

app.post("/registerUser", async (req, res) => {
  console.log(req.body);
  const { fName, lName, email, password } = req.body;

  const encryptedPassword = await bcrypt.hash(password, 10);

  try {
    const oldUser = await User.findOne({ email });

    if (oldUser) {
      return res.json({ error: "User already exits" });
    }

    await User.create({
      fName,
      lName,
      email,
      password: encryptedPassword,
    });
    res.send({ status: "ok" });
  } catch (error) {
    res.send({ status: "error" });
  }
});

// Login API

app.post("/loginUser", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.json({
      error: "User does not exits, please register if you haven't",
    });
  }
  if (await bcrypt.compare(password, user.password)) {
    //creates token with secret
    const token = jwt.sign({ email: user.email }, JWT_secret);

    if (res.status(201)) {
      return res.json({ status: "ok", data: token, userType: user.userType });
    } else {
      return res.json({ status: "error" });
    }
  }
  res.json({ status: "error", error: "Invalid Credentials" });
});

// User data API

app.post("/userData", async (req, res) => {
  const { token } = req.body;
  try {
    const user = jwt.verify(token, JWT_secret);
    const userEmail = user.email;

    User.findOne({ email: userEmail })
      .then((data) => {
        res.send({ staus: "ok", data: data });
      })
      .catch((error) => {
        res.send({ status: "error", data: error });
      });
  } catch (error) {
    res.send({ satus: "error" });
  }
});

// Forgot password API

app.post("/forgotPassword", async (req, res) => {
  const { email } = req.body;
  try {
    const oldUser = await User.findOne({ email });
    if (!oldUser) {
      return res.json({ status: "User does not exists" });
    }
    const secret = JWT_secret + oldUser.password;

    const token = jwt.sign({ email: oldUser.email, id: oldUser._id }, secret, {
      expiresIn: "5m",
    });
    //

    const resetPassUrl = isProduction
      ? process.env.RESET_PASS_URL
      : "http://localhost:3000";

    const link = `${resetPassUrl}/resetPassword/${oldUser._id}/${token}`;
    console.log(link);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.NODEMAILER_USER,
        pass: process.env.NODEMAILER_PASS,
      },
    });

    const mailOptions = {
      from: "youremail@gmail.com",
      to: email,
      subject: "Password reset ",
      text: link,
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log("Email sent: " + info.response);
      }
    });
  } catch (error) {
    console.log(error);
  }
});

// Reset password API (get)

app.get("/resetPassword/:id/:token", async (req, res) => {
  const { id, token } = req.params;
  console.log(req.params);
  //verfy id
  const oldUser = await User.findOne({ _id: id });
  if (!oldUser) {
    return res.json({ status: "User does not exists" });
  }
  const secret = JWT_secret + oldUser.password;
  try {
    const verify = jwt.verify(token, secret);
    res.render("index", { email: verify.email, status: "verified" });
  } catch (error) {
    res.send("Not verified");
    console.log(error);
  }
});

// Reset password API (post)

app.post("/resetPassword/:id/:token", async (req, res) => {
  const { id, token } = req.params;
  const { password } = req.body;
  //verfy id
  const oldUser = await User.findOne({ _id: id });
  if (!oldUser) {
    return res.json({ status: "User does not exists" });
  }
  const secret = JWT_secret + oldUser.password;
  try {
    const verify = jwt.verify(token, secret);
    const encryptedPassword = await bcrypt.hash(password, 10);
    await User.updateOne(
      {
        _id: id,
      },
      {
        $set: {
          password: encryptedPassword,
        },
      }
    );
    // res.json({ status: "Password updated" });

    res.render("index", {
      email: verify.email,
      status: "verifiedWithUpdatedPass",
    });
  } catch (error) {
    res.json({ status: "Something went wrong" });
    console.log(error);
  }
});

//Importing post schema

const Post = mongoose.model("post");

//Upload Post API

app.post("/uploadPost", upload.single("post"), async (req, res) => {
  try {
    const { pName, pDescription } = req.body;
    const { buffer, mimetype } = req.file;

    const newPost = new Post({
      pName,
      pDescription,
      image: {
        data: buffer.toString("base64"),
        contentType: mimetype,
      },
    });

    await newPost.save();

    res.send({ status: "ok", data: "Post uploaded successfully." });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send({ status: "error", message: "Failed to upload Post." });
  }
});

//Retrieve Post API

app.get("/getPost", async (req, res) => {
  try {
    const posts = await Post.find();

    const processedPost = posts.map((post) => ({
      _id: post._id,
      pName: post.pName,
      pDescription: post.pDescription,
      image: {
        contentType: post.image.contentType,
        data: `data:${post.image.contentType};base64,${post.image.data}`,
      },
    }));

    res.json(processedPost);
  } catch (error) {
    console.log(error);
    res.status(500).send({
      status: "error",
      message: "Failed to retrieve Post.",
    });
  }
});

// Delete Post API

app.post("/deletePost", async (req, res) => {
  const { postId } = req.body;
  try {
    await Post.deleteOne({ _id: postId }),
      function (err, res) {
        console.log(err);
      };
    res.send({ status: "ok", data: "Post deleted" });
  } catch (error) {
    console.log(error);
    res.send({ status: "error", data: "Failed to delete Post" });
  }
});

// Edit Post API

app.post("/editPost", upload.single("post"), async (req, res) => {
  const { postId, pName, pDescription } = req.body;

  if (!postId) {
    return res
      .status(400)
      .send({ status: "error", message: "Invalid postId." });
  }

  try {
    let updateFields = { pName, pDescription };

    if (req.file) {
      const { buffer, mimetype } = req.file;
      updateFields.image = {
        data: buffer.toString("base64"),
        contentType: mimetype,
      };
    }

    const updateQuery = updateFields.image
      ? { $set: updateFields }
      : updateFields;
    await Post.updateOne({ _id: postId }, updateQuery);
    res.send({ status: "ok", data: "Post updated" });
  } catch (error) {
    console.log(error);
    res.status(500).send({ status: "error", message: "Failed to update Post" });
  }
});
