import Image from "next/image";

interface BadgeIconProps {
  icon: string;
  iconType: string;
  size?: number;
  className?: string;
}

export default function BadgeIcon({ icon, iconType, size = 32, className = "" }: BadgeIconProps) {
  if (iconType === "image") {
    return (
      <Image
        src={icon}
        alt=""
        width={size}
        height={size}
        className={`object-contain ${className}`}
      />
    );
  }

  // emoji
  return (
    <span
      className={`leading-none select-none ${className}`}
      style={{ fontSize: size * 0.75 }}
    >
      {icon}
    </span>
  );
}
