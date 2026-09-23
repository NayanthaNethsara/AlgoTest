export type ProbedPort = {
  port: number;
  product: string;
};

export type ProctorDisclosure = {
  version: string;
  summary: string;
  collected: string[];
  notCollected: string[];
  lifecycle: string[];
  retention: string;
  policy: string;
};

export type DisclosureResponse = {
  disclosure: ProctorDisclosure;
  probedPorts: ProbedPort[];
};
