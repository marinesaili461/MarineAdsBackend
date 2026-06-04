import mongoose from "mongoose";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import Message from "./models/Message.js";

dotenv.config();

/* ========================================
   🗄️ CONNECT TO MONGODB
======================================== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.log("❌ MongoDB error:", err));

const PORT = process.env.PORT || 10000;

/* ========================================
   🌐 CREATE HTTP SERVER
======================================== */
const server = http.createServer(app);

/* ========================================
   🔌 SOCKET.IO SETUP
======================================== */
export const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin.includes("mainecash.vercel.app") ||
        origin.includes("localhost")
      ) {
        return callback(null, true);
      }
      console.log("🚫 Blocked by Socket.IO CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

/* Make io accessible in controllers */
app.set("io", io);

/* ========================================
   🔗 SOCKET CONNECTION
======================================== */
io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  socket.on("sendMessage", async (data) => {
    try {
      const newMessage = new Message({
        sender: data.userId,
        content: data.content,
        type: "text",
      });
      await newMessage.save();
      const populated = await newMessage.populate("sender", "fullName badge referralLevel");
      io.emit("receiveMessage", populated);
    } catch (err) {
      console.error("❌ Error saving message:", err);
    }
  });

  socket.on("typing", ({ userName }) => {
    socket.broadcast.emit("typing", { userName });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

/* ========================================
   🚀 START SERVER
======================================== */
server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
