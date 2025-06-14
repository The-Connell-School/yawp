import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

interface GrowthData {
  createdAt: Date;
  _count: number;
}

interface Props {
  data: GrowthData[];
}

export function GrowthChart({ data }: Props) {
  let cumulativeCount = 0;
  const chartData = data.map((item) => {
    cumulativeCount += item._count;
    return {
      date: new Date(item.createdAt).toLocaleDateString(),
      count: cumulativeCount,
    };
  });

  const counts = chartData.map((d) => d.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const ticks = [];
  for (let i = min; i <= max; i++) {
    ticks.push(i);
  }

  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={chartData}>
        <XAxis
          dataKey="date"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          ticks={ticks}
          allowDecimals={false}
        />
        <Line
          type="natural"
          dataKey="count"
          stroke="currentColor"
          strokeWidth={2}
          dot={false}
          className="stroke-primary"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
