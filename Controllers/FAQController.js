import FAQ from "../models/FAQ.js";

// Public
export const getPublicFAQs = async (req, res) => {
  try {
    const faqs = await FAQ.find({ isVisible: true }).sort({ order: 1, createdAt: -1 });
    res.json(faqs);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Admin
export const getAllFAQs = async (req, res) => {
  try {
    const faqs = await FAQ.find().sort({ order: 1, createdAt: -1 });
    res.json(faqs);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const createFAQ = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title?.trim() || !description?.trim())
      return res.status(400).json({ message: "Title and description are required." });

    const faq = await FAQ.create({ title: title.trim(), description: description.trim() });
    res.status(201).json(faq);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const updateFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!faq) return res.status(404).json({ message: "FAQ not found" });
    res.json(faq);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    if (!faq) return res.status(404).json({ message: "FAQ not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
