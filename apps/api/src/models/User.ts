import mongoose from "mongoose";

export type Role = "trainee" | "instructor" | "admin";
export type InstructorApprovalStatus = "pending" | "approved" | "rejected";

const UserSchema = new mongoose.Schema(
  {
    // Canonical identity key for auth contract (FR-001).
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Legacy compatibility field; retained temporarily while auth flow migrates.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["trainee", "instructor", "admin"],
      default: "trainee",
      set: (value: string) => {
        if (value === "user") return "trainee";
        return value;
      },
    },
    instructorApprovalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: function (this: { role?: Role }) {
        return this.role === "instructor" ? "pending" : "approved";
      },
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

UserSchema.pre("validate", function setUsernameFromEmail() {
  if (!this.username && this.email) this.username = this.email;
});

UserSchema.pre("save", function enforceApprovalAuditConsistency() {
  const status = this.instructorApprovalStatus as InstructorApprovalStatus | undefined;

  if (!status) return;

  if (status === "approved") {
    if (!this.approvedAt) this.approvedAt = new Date();
    this.rejectionReason = null;
    return;
  }

  if (status === "rejected") {
    this.approvedAt = null;
    this.approvedBy = null;
    return;
  }

  // pending state must always be non-approved and non-rejected.
  this.approvedAt = null;
  this.approvedBy = null;
  this.rejectionReason = null;
  return;
});

export const User = mongoose.model("User", UserSchema);
