import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Polyline,
  Line,
  G,
} from '@react-pdf/renderer';
import { DoctorVisitExport } from '@/lib/services/reports';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 18, marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 11, marginBottom: 16, color: '#555' },
  sectionTitle: { fontSize: 13, marginTop: 16, marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ddd', paddingVertical: 4 },
  headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 4, fontFamily: 'Helvetica-Bold' },
  cell: { flex: 1 },
  smallCell: { width: 60 },
  muted: { color: '#666' },
  incident: { marginBottom: 4 },
  caveat: { marginTop: 16, fontSize: 9, color: '#999', fontFamily: 'Helvetica-Oblique' },
});

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DoctorVisitReport({ data }: { data: DoctorVisitExport }) {
  const { patient, range, adherence, mood, incidents, timeline, needsReviewCount } = data;

  // Build a simple mood line chart.
  const width = 480;
  const height = 120;
  const padding = 20;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const pointsWithMood = mood
    .map((p, i) => ({ ...p, index: i, mood: p.averageMood }))
    .filter((p) => p.mood !== null) as Array<{
    date: string;
    averageMood: number;
    index: number;
    mood: number;
  }>;

  const maxMood = 5;
  const minMood = 1;
  const xStep = mood.length > 1 ? chartWidth / (mood.length - 1) : chartWidth;
  const yScale = chartHeight / (maxMood - minMood);

  const polylinePoints = pointsWithMood
    .map((p) => {
      const x = padding + p.index * xStep;
      const y = height - padding - (p.mood - minMood) * yScale;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Doctor Visit Report</Text>
        <Text style={styles.subtitle}>
          {patient.name} · {formatDate(range.start)} – {formatDate(range.end)}
        </Text>

        <Text style={styles.sectionTitle}>Adherence</Text>
        <View style={styles.headerRow}>
          <Text style={styles.cell}>Schedule</Text>
          <Text style={styles.smallCell}>Scheduled</Text>
          <Text style={styles.smallCell}>Logged</Text>
          <Text style={styles.smallCell}>On Time</Text>
          <Text style={styles.smallCell}>Missed</Text>
          <Text style={styles.smallCell}>%</Text>
        </View>
        {adherence.map((row) => (
          <View key={row.scheduleId} style={styles.row}>
            <Text style={styles.cell}>{row.scheduleName}</Text>
            <Text style={styles.smallCell}>{row.scheduled}</Text>
            <Text style={styles.smallCell}>{row.logged}</Text>
            <Text style={styles.smallCell}>{row.onTime}</Text>
            <Text style={styles.smallCell}>{row.missed}</Text>
            <Text style={styles.smallCell}>{row.onTimePercent}%</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Mood Trend</Text>
        {mood.length > 0 && pointsWithMood.length > 0 ? (
          <Svg width={width} height={height}>
            <G>
              <Line
                x1={padding}
                y1={height - padding}
                x2={width - padding}
                y2={height - padding}
                stroke="#ccc"
                strokeWidth={1}
              />
              <Line
                x1={padding}
                y1={padding}
                x2={padding}
                y2={height - padding}
                stroke="#ccc"
                strokeWidth={1}
              />
              <Polyline
                points={polylinePoints}
                fill="none"
                stroke="#2563eb"
                strokeWidth={2}
              />
            </G>
          </Svg>
        ) : (
          <Text style={styles.muted}>No mood data for this period.</Text>
        )}

        <Text style={styles.sectionTitle}>Incidents</Text>
        {incidents.length === 0 && (
          <Text style={styles.muted}>No incidents recorded.</Text>
        )}
        {incidents.slice(0, 20).map((item) => (
          <View key={item.id} style={styles.incident}>
            <Text>
              {formatDate(item.occurredAt)} · {item.category ?? 'note'} · {item.rawInput ?? ''}
            </Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Condensed Event Log</Text>
        {timeline.slice(0, 30).map((event) => (
          <View key={event.id} style={styles.row}>
            <Text style={[styles.cell, styles.muted]}>
              {formatDate(event.occurredAt)}
            </Text>
            <Text style={styles.cell}>{event.category ?? 'note'}</Text>
            <Text style={[styles.cell, { flex: 2 }]}>{event.rawInput ?? ''}</Text>
          </View>
        ))}

        <Text style={styles.caveat}>
          {needsReviewCount > 0
            ? `${needsReviewCount} entry/entries awaiting review are excluded from these aggregates.`
            : 'All aggregates include only confirmed events.'}
        </Text>
      </Page>
    </Document>
  );
}
