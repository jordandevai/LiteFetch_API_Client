type TableValidationNoticeProps = {
  duplicateCount?: number;
  missingKeyCount?: number;
  duplicateMessage: string;
  missingKeyMessage: string;
};

export const TableValidationNotice = ({
  duplicateCount = 0,
  missingKeyCount = 0,
  duplicateMessage,
  missingKeyMessage,
}: TableValidationNoticeProps) => {
  if (!duplicateCount && !missingKeyCount) return null;
  return (
    <div className="px-2 pb-2 text-[11px] text-amber-700">
      {duplicateCount ? `${duplicateMessage} ` : ''}
      {missingKeyCount ? missingKeyMessage : ''}
    </div>
  );
};
