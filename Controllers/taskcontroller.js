import Task from "../models/Task.js";

export const createTask = async (req, res) => {
  try {
    const { title, description, reward, category, link } = req.body;
    const task = new Task({ title, description, reward, category, link, createdBy: req.user._id });
    const savedTask = await task.save();
    res.status(201).json(savedTask);
  } catch (error) { res.status(500).json({ message: error.message }); }
};

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ isActive: true }).sort({ createdAt: -1 });
    res.status(200).json(tasks);
  } catch (error) { res.status(500).json({ message: error.message }); }
};

export const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json(task);
  } catch (error) { res.status(500).json({ message: error.message }); }
};
