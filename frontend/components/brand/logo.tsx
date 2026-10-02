import Image from "next/image";

type Props = {
  size?: number;
  className?: string;
};

export function LogoMark({ size = 32, className = "" }: Props) {
  return (
    <Image
      src="/icon-stockkit.png"
      alt="StockKit"
      width={size}
      height={size}
      priority
      className={className}
    />
  );
}
