import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const Announcement = mongoose.model('Announcement', announcementSchema);

export default Announcement;
