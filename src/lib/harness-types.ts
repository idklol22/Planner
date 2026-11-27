/** Types shared with the read-only LearnHarness mirror and the hub note command. */

export interface HarnessTopic {
  id: string;
  name: string;
}

export interface HarnessSubject {
  id: string;
  name: string;
  color: string;
  topics: HarnessTopic[];
}

/** Payload of the `harness.note` command queued through the hub. */
export interface HarnessNote {
  externalId: string;
  subjectId: string;
  topicId?: string;
  title: string;
  date: string;
  markdown: string;
  finished: boolean;
}
