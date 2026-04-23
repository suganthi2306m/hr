/** Default shape for `User.employeeProfile` (HR-style onboarding). */

export function emptyEmployeeProfile() {
  return {
    firstName: '',
    lastName: '',
    fatherHusband: '',
    nationality: 'Indian',
    bloodGroup: '',
    /** Job title / position label (not system RBAC role). */
    jobRoleTitle: '',
    department: '',
    branchName: '',
    designation: '',
    employmentType: '',
    sourceOfHire: '',
    dateOfJoining: '',
    currentExperienceLabel: '',
    totalExperienceYears: '',
    totalExperienceMonths: '',
    probationDays: '',
    reportingManagerId: '',
    secondaryReportingManagerId: '',
    dateOfBirth: '',
    age: '',
    gender: '',
    maritalStatus: '',
    aboutMe: '',
    uan: '',
    pan: '',
    aadhaar: '',
    ipNumber: '',
    paymentMode: 'Cash',
    accountNumber: '',
    ifscCode: '',
    bankName: '',
    bankBranchName: '',
    beneficiaryCode: '',
    crnNumber: '',
    workPhone: '',
    personalMobile: '',
    emergencyContact: '',
    personalEmail: '',
    permanentAddress: '',
    localAddress: '',
    workExperience: [],
    education: [],
    custom: {},
  };
}

export function mergeEmployeeProfile(fromApi) {
  const base = emptyEmployeeProfile();
  const src = fromApi && typeof fromApi === 'object' && !Array.isArray(fromApi) ? fromApi : {};
  const workExperience = Array.isArray(src.workExperience) ? src.workExperience.map((r) => ({ ...r })) : [];
  const education = Array.isArray(src.education) ? src.education.map((r) => ({ ...r })) : [];
  const custom = src.custom && typeof src.custom === 'object' && !Array.isArray(src.custom) ? { ...src.custom } : {};
  return { ...base, ...src, workExperience, education, custom };
}

/** Labels for read-only profile / onboarding sections. */
export const EMPLOYEE_PROFILE_SECTIONS = [
  {
    title: 'Basic detail',
    fields: [
      ['firstName', 'First name'],
      ['lastName', 'Last name'],
      ['fatherHusband', 'Father / husband'],
      ['nationality', 'Nationality'],
      ['bloodGroup', 'Blood group'],
    ],
  },
  {
    title: 'Work information',
    fields: [
      ['jobRoleTitle', 'Role (job title)'],
      ['department', 'Department'],
      ['designation', 'Designation'],
      ['employmentType', 'Employment type'],
      ['sourceOfHire', 'Source of hire'],
      ['dateOfJoining', 'Date of joining'],
      ['currentExperienceLabel', 'Current experience'],
      ['totalExperienceYears', 'Total experience (years)'],
      ['totalExperienceMonths', 'Total experience (months)'],
      ['probationDays', 'Probation (days)'],
    ],
  },
  {
    title: 'Hierarchy',
    fields: [
      ['reportingManagerId', 'Reporting manager (user id)'],
      ['secondaryReportingManagerId', 'Secondary reporting manager (user id)'],
    ],
  },
  {
    title: 'Personal',
    fields: [
      ['dateOfBirth', 'Date of birth'],
      ['age', 'Age'],
      ['gender', 'Gender'],
      ['maritalStatus', 'Marital status'],
      ['aboutMe', 'About me'],
    ],
  },
  {
    title: 'Identity',
    fields: [
      ['uan', 'UAN'],
      ['pan', 'PAN'],
      ['aadhaar', 'Aadhaar'],
      ['ipNumber', 'IP number'],
    ],
  },
  {
    title: 'Bank',
    fields: [
      ['paymentMode', 'Payment mode'],
      ['accountNumber', 'Account number'],
      ['ifscCode', 'IFSC code'],
      ['bankName', 'Bank name'],
      ['bankBranchName', 'Branch name'],
      ['beneficiaryCode', 'Beneficiary code'],
      ['crnNumber', 'CRN number'],
    ],
  },
  {
    title: 'Contact',
    fields: [
      ['workPhone', 'Work phone'],
      ['personalMobile', 'Personal mobile'],
      ['emergencyContact', 'Emergency contact'],
      ['personalEmail', 'Personal email'],
      ['permanentAddress', 'Permanent address'],
      ['localAddress', 'Local address'],
    ],
  },
];

export const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
