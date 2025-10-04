import { describe, it, expect, beforeEach } from "vitest";
import { buffCV, stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_HASH = 101;
const ERR_INVALID_METADATA = 102;
const ERR_INVALID_CATEGORY = 103;
const ERR_INVALID_TIMESTAMP = 104;
const ERR_CONTRIB_ALREADY_EXISTS = 105;
const ERR_CONTRIB_NOT_FOUND = 106;
const ERR_INVALID_STATUS = 107;
const ERR_MAX_CONTRIBS_EXCEEDED = 108;
const ERR_INVALID_USER = 109;
const ERR_INVALID_DESCRIPTION = 110;
const ERR_INVALID_LOCATION = 111;
const ERR_INVALID_DATA_TYPE = 112;
const ERR_INVALID_VALIDATION_THRESHOLD = 113;
const ERR_AUTHORITY_NOT_VERIFIED = 114;
const ERR_INVALID_UPDATE_PARAM = 115;
const ERR_UPDATE_NOT_ALLOWED = 116;
const ERR_INVALID_SUBMISSION_FEE = 117;
const ERR_INVALID_REWARD_RATE = 118;
const ERR_INVALID_EXPIRY = 119;
const ERR_INVALID_POINTS = 120;

interface Contribution {
  dataHash: Buffer;
  metadata: string;
  category: string;
  timestamp: number;
  submitter: string;
  dataType: string;
  description: string;
  location: string;
  status: boolean;
  expiry: number;
  pointsAwarded: number;
}

interface ContribUpdate {
  updateMetadata: string;
  updateDescription: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ContributionSubmissionMock {
  state: {
    nextContribId: number;
    maxContribs: number;
    submissionFee: number;
    authorityContract: string | null;
    rewardRate: number;
    validationThreshold: number;
    contributions: Map<number, Contribution>;
    contribUpdates: Map<number, ContribUpdate>;
    contribsByHash: Map<string, number>;
  } = {
    nextContribId: 0,
    maxContribs: 10000,
    submissionFee: 500,
    authorityContract: null,
    rewardRate: 10,
    validationThreshold: 3,
    contributions: new Map(),
    contribUpdates: new Map(),
    contribsByHash: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextContribId: 0,
      maxContribs: 10000,
      submissionFee: 500,
      authorityContract: null,
      rewardRate: 10,
      validationThreshold: 3,
      contributions: new Map(),
      contribUpdates: new Map(),
      contribsByHash: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setSubmissionFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newFee < 0) return { ok: false, value: false };
    this.state.submissionFee = newFee;
    return { ok: true, value: true };
  }

  setRewardRate(newRate: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newRate <= 0 || newRate > 50) return { ok: false, value: false };
    this.state.rewardRate = newRate;
    return { ok: true, value: true };
  }

  setValidationThreshold(newThreshold: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newThreshold <= 0 || newThreshold > 10) return { ok: false, value: false };
    this.state.validationThreshold = newThreshold;
    return { ok: true, value: true };
  }

  submitContribution(
    dataHash: Buffer,
    metadata: string,
    category: string,
    dataType: string,
    description: string,
    location: string,
    expiry: number,
    initialPoints: number
  ): Result<number> {
    if (this.state.nextContribId >= this.state.maxContribs) return { ok: false, value: ERR_MAX_CONTRIBS_EXCEEDED };
    if (dataHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (!metadata || metadata.length > 256) return { ok: false, value: ERR_INVALID_METADATA };
    if (!["environment", "biology", "astronomy", "physics"].includes(category)) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (!["observation", "measurement", "photo", "sample"].includes(dataType)) return { ok: false, value: ERR_INVALID_DATA_TYPE };
    if (!description || description.length > 512) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (expiry <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRY };
    if (initialPoints < 0) return { ok: false, value: ERR_INVALID_POINTS };
    if (this.state.contribsByHash.has(dataHash.toString('hex'))) return { ok: false, value: ERR_CONTRIB_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.submissionFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextContribId;
    const contrib: Contribution = {
      dataHash,
      metadata,
      category,
      timestamp: this.blockHeight,
      submitter: this.caller,
      dataType,
      description,
      location,
      status: false,
      expiry,
      pointsAwarded: initialPoints,
    };
    this.state.contributions.set(id, contrib);
    this.state.contribsByHash.set(dataHash.toString('hex'), id);
    this.state.nextContribId++;
    return { ok: true, value: id };
  }

  getContribution(id: number): Contribution | null {
    return this.state.contributions.get(id) || null;
  }

  updateContribution(id: number, updateMetadata: string, updateDescription: string): Result<boolean> {
    const contrib = this.state.contributions.get(id);
    if (!contrib) return { ok: false, value: false };
    if (contrib.submitter !== this.caller) return { ok: false, value: false };
    if (contrib.status) return { ok: false, value: false };
    if (!updateMetadata || updateMetadata.length > 256) return { ok: false, value: false };
    if (!updateDescription || updateDescription.length > 512) return { ok: false, value: false };

    const updated: Contribution = {
      ...contrib,
      metadata: updateMetadata,
      description: updateDescription,
      timestamp: this.blockHeight,
    };
    this.state.contributions.set(id, updated);
    this.state.contribUpdates.set(id, {
      updateMetadata,
      updateDescription,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  approveContribution(id: number): Result<boolean> {
    const contrib = this.state.contributions.get(id);
    if (!contrib) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (contrib.status) return { ok: false, value: false };

    const updated: Contribution = {
      ...contrib,
      status: true,
      timestamp: this.blockHeight,
    };
    this.state.contributions.set(id, updated);
    return { ok: true, value: true };
  }

  getContribCount(): Result<number> {
    return { ok: true, value: this.state.nextContribId };
  }

  checkContribExistence(hash: Buffer): Result<boolean> {
    return { ok: true, value: this.state.contribsByHash.has(hash.toString('hex')) };
  }
}

describe("ContributionSubmission", () => {
  let contract: ContributionSubmissionMock;

  beforeEach(() => {
    contract = new ContributionSubmissionMock();
    contract.reset();
  });

  it("submits a contribution successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = Buffer.alloc(32, 1);
    const result = contract.submitContribution(
      dataHash,
      "Meta data",
      "environment",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const contrib = contract.getContribution(0);
    expect(contrib?.metadata).toBe("Meta data");
    expect(contrib?.category).toBe("environment");
    expect(contrib?.dataType).toBe("observation");
    expect(contrib?.description).toBe("Detailed desc");
    expect(contrib?.location).toBe("LocationX");
    expect(contrib?.expiry).toBe(100);
    expect(contrib?.pointsAwarded).toBe(50);
    expect(contrib?.status).toBe(false);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate contribution hashes", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = Buffer.alloc(32, 1);
    contract.submitContribution(
      dataHash,
      "Meta data",
      "environment",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    const result = contract.submitContribution(
      dataHash,
      "New meta",
      "biology",
      "measurement",
      "New desc",
      "LocationY",
      200,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CONTRIB_ALREADY_EXISTS);
  });

  it("rejects submission without authority contract", () => {
    const dataHash = Buffer.alloc(32, 1);
    const result = contract.submitContribution(
      dataHash,
      "Meta data",
      "environment",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid hash length", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = Buffer.alloc(31, 1);
    const result = contract.submitContribution(
      dataHash,
      "Meta data",
      "environment",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects invalid category", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = Buffer.alloc(32, 1);
    const result = contract.submitContribution(
      dataHash,
      "Meta data",
      "invalid",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CATEGORY);
  });

  it("updates a contribution successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = Buffer.alloc(32, 1);
    contract.submitContribution(
      dataHash,
      "Old meta",
      "environment",
      "observation",
      "Old desc",
      "LocationX",
      100,
      50
    );
    const result = contract.updateContribution(0, "New meta", "New desc");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const contrib = contract.getContribution(0);
    expect(contrib?.metadata).toBe("New meta");
    expect(contrib?.description).toBe("New desc");
    const update = contract.state.contribUpdates.get(0);
    expect(update?.updateMetadata).toBe("New meta");
    expect(update?.updateDescription).toBe("New desc");
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent contribution", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateContribution(99, "New meta", "New desc");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-submitter", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = Buffer.alloc(32, 1);
    contract.submitContribution(
      dataHash,
      "Meta data",
      "environment",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateContribution(0, "New meta", "New desc");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("approves a contribution successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = Buffer.alloc(32, 1);
    contract.submitContribution(
      dataHash,
      "Meta data",
      "environment",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    const result = contract.approveContribution(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const contrib = contract.getContribution(0);
    expect(contrib?.status).toBe(true);
  });

  it("rejects approval without authority contract", () => {
    const dataHash = Buffer.alloc(32, 1);
    contract.submitContribution(
      dataHash,
      "Meta data",
      "environment",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    const result = contract.approveContribution(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets submission fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setSubmissionFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.submissionFee).toBe(1000);
    const dataHash = Buffer.alloc(32, 1);
    contract.submitContribution(
      dataHash,
      "Meta data",
      "environment",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("returns correct contribution count", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash1 = Buffer.alloc(32, 1);
    const dataHash2 = Buffer.alloc(32, 2);
    contract.submitContribution(
      dataHash1,
      "Meta1",
      "environment",
      "observation",
      "Desc1",
      "Loc1",
      100,
      50
    );
    contract.submitContribution(
      dataHash2,
      "Meta2",
      "biology",
      "measurement",
      "Desc2",
      "Loc2",
      200,
      100
    );
    const result = contract.getContribCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks contribution existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = Buffer.alloc(32, 1);
    contract.submitContribution(
      dataHash,
      "Meta data",
      "environment",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    const result = contract.checkContribExistence(dataHash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const fakeHash = Buffer.alloc(32, 255);
    const result2 = contract.checkContribExistence(fakeHash);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses contribution parameters with Clarity types", () => {
    const meta = stringUtf8CV("TestMeta");
    const points = uintCV(50);
    expect(meta.value).toBe("TestMeta");
    expect(points.value).toEqual(BigInt(50));
  });

  it("rejects submission with empty metadata", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = Buffer.alloc(32, 1);
    const result = contract.submitContribution(
      dataHash,
      "",
      "environment",
      "observation",
      "Detailed desc",
      "LocationX",
      100,
      50
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_METADATA);
  });

  it("rejects submission with max contribs exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxContribs = 1;
    const dataHash1 = Buffer.alloc(32, 1);
    contract.submitContribution(
      dataHash1,
      "Meta1",
      "environment",
      "observation",
      "Desc1",
      "Loc1",
      100,
      50
    );
    const dataHash2 = Buffer.alloc(32, 2);
    const result = contract.submitContribution(
      dataHash2,
      "Meta2",
      "biology",
      "measurement",
      "Desc2",
      "Loc2",
      200,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_CONTRIBS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});