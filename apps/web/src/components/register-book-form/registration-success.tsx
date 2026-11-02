import { useState } from "react";
import type { Asset } from "@library/schemas";

export const RegistrationSuccess = ({
  asset,
  isReloading,
  listedBooks,
}: RegistrationSuccessProps): React.JSX.Element => {
  const [announced, setAnnounced] = useState<Announced>(NOTHING_ANNOUNCED);

  // Announce once, when the post-registration reload settles; later list changes must not rewrite it.
  if (asset === undefined && announced.asset !== undefined) {
    setAnnounced(NOTHING_ANNOUNCED);
  } else if (asset !== undefined && !isReloading && announced.asset !== asset) {
    setAnnounced({ asset, text: buildAnnouncement({ asset, listedBooks }) });
  }

  return (
    <output className="text-green-800">{announced.asset === asset ? announced.text : ""}</output>
  );
};

const buildAnnouncement = ({ asset, listedBooks }: AnnouncementOptions): string => {
  const registered = `"${asset.title}" registered.`;
  const isHidden = listedBooks !== undefined && !listedBooks.some((book) => book.id === asset.id);
  return isHidden ? `${registered} ${HIDDEN_BY_FILTERS_SENTENCE}` : registered;
};

const HIDDEN_BY_FILTERS_SENTENCE = "It is hidden by the current filters — clear them to see it.";

const NOTHING_ANNOUNCED: Announced = { asset: undefined, text: "" };

interface Announced {
  readonly asset: Asset | undefined;
  readonly text: string;
}

interface RegistrationSuccessProps {
  readonly asset?: Asset;
  readonly isReloading: boolean;
  readonly listedBooks?: readonly Asset[];
}

interface AnnouncementOptions {
  readonly asset: Asset;
  readonly listedBooks?: readonly Asset[];
}
