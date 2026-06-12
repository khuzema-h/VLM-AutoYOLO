import { useState, useEffect, useMemo } from "react";
import { Radio, Slider, Checkbox, Button, Card, Statistic, Table, Alert, Spin, Switch } from "antd";
import { 
  ExperimentOutlined, 
  SafetyOutlined, 
  DotChartOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  InfoCircleOutlined,
  SlidersOutlined
} from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { fetchAnnotations, compareImageUrl, type CompareBox } from "@/services/api";
import {
  mapVlmBoxClass,
  mapVlmBoxes,
  vlmLabelsForGtClass,
} from "@/lib/compareLabelMap";
export function CompareView() {
  const { t } = useTranslation();
  const {
    compareDataset,
    compareImage,
    compareVlmLabels,
    compareGtClasses,
    compareLabelMap,
    compareMaxBBoxArea,
    compareMinConfidence,
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    humanBoxes: CompareBox[];
    vlmBoxes: CompareBox[];
    dimensions: { width: number; height: number };
    vlmCached: boolean;
  } | null>(null);

  // User Preferences / Config
  const [viewMode, setViewMode] = useState<"side_by_side" | "overlay">("side_by_side");
  const [showHuman, setShowHuman] = useState(true);
  const [showVlm, setShowVlm] = useState(true);
  const [iouThreshold, setIouThreshold] = useState(0.5);
  const [autoRunVlm, setAutoRunVlm] = useState(() => {
    return localStorage.getItem("compare_auto_run_vlm") === "true";
  });
  const [selectedClasses, setSelectedClasses] = useState<Record<string, boolean>>({});

  // Save auto-run setting
  useEffect(() => {
    localStorage.setItem("compare_auto_run_vlm", String(autoRunVlm));
  }, [autoRunVlm]);

  // Fetch annotations
  const loadAnnotations = async (runVLM = false) => {
    if (!compareDataset || !compareImage) return;
    setLoading(true);
    try {
      const res = await fetchAnnotations(
        compareDataset,
        compareImage.imagePath,
        compareImage.labelPath,
        runVLM,
        compareVlmLabels.length > 0 ? compareVlmLabels : undefined,
        compareMaxBBoxArea,
        compareMinConfidence,
      );
      setData(res);
      
      const gtClassNames = Array.from(
        new Set([...compareGtClasses, ...res.humanBoxes.map((b) => b.className)]),
      );
      const initialClasses: Record<string, boolean> = {};
      gtClassNames.forEach((c) => {
        initialClasses[c] = true;
      });
      setSelectedClasses(prev => {
        // Keep existing selection if possible, otherwise merge
        const updated = { ...initialClasses };
        Object.keys(prev).forEach(k => {
          if (k in updated) {
            updated[k] = prev[k];
          }
        });
        return updated;
      });

      // Update the image list cache status locally
      if (runVLM && !compareImage.hasVlmPrediction) {
        compareImage.hasVlmPrediction = true;
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (compareDataset && compareImage) {
      const shouldRunVlm = !compareImage.hasVlmPrediction && autoRunVlm && compareVlmLabels.length > 0;
      loadAnnotations(shouldRunVlm);
    } else {
      setData(null);
    }
  }, [compareDataset, compareImage, compareVlmLabels, compareMaxBBoxArea, compareMinConfidence]);

  const mappedVlmBoxes = useMemo(() => {
    if (!data) return [];
    return mapVlmBoxes(data.vlmBoxes, compareLabelMap);
  }, [data, compareLabelMap]);

  const unmappedVlmCount = useMemo(() => {
    if (!data) return 0;
    return data.vlmBoxes.filter((b) => !mapVlmBoxClass(b.className, compareLabelMap)).length;
  }, [data, compareLabelMap]);

  // IoU and Bipartite Greedy Matching calculations
  const metrics = useMemo(() => {
    if (!data) return null;

    const gtBoxes = data.humanBoxes.filter((b) => selectedClasses[b.className]);
    const predBoxes = mappedVlmBoxes.filter((b) => selectedClasses[b.className]);

    function getBoxIoU(box1: CompareBox, box2: CompareBox) {
      const ix1 = Math.max(box1.x1, box2.x1);
      const iy1 = Math.max(box1.y1, box2.y1);
      const ix2 = Math.min(box1.x2, box2.x2);
      const iy2 = Math.min(box1.y2, box2.y2);
      
      const intersection = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
      const area1 = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
      const area2 = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);
      const union = area1 + area2 - intersection;
      return union > 0 ? intersection / union : 0;
    }

    const activeClasses = Object.keys(selectedClasses).filter((c) => selectedClasses[c]);
    
    // Global & per-class metrics
    let totalTP = 0;
    let totalFP = 0;
    let totalFN = 0;
    let totalIoUSum = 0;
    let totalMatches = 0;

    const classStats = activeClasses.map((cls) => {
      const clsGt = gtBoxes.filter(b => b.className === cls);
      const clsPred = [...predBoxes.filter(b => b.className === cls)];

      let tp = 0;
      let iouSum = 0;
      
      // Bipartite matching (greedy by highest IoU)
      const allPairs: { gtIdx: number; predIdx: number; iou: number }[] = [];
      clsGt.forEach((gt, gtIdx) => {
        clsPred.forEach((pred, predIdx) => {
          const iou = getBoxIoU(gt, pred);
          if (iou >= iouThreshold) {
            allPairs.push({ gtIdx, predIdx, iou });
          }
        });
      });

      // Sort by IoU desc
      allPairs.sort((a, b) => b.iou - a.iou);

      const matchedGt = new Set<number>();
      const matchedPred = new Set<number>();

      allPairs.forEach((pair) => {
        if (!matchedGt.has(pair.gtIdx) && !matchedPred.has(pair.predIdx)) {
          matchedGt.add(pair.gtIdx);
          matchedPred.add(pair.predIdx);
          tp += 1;
          iouSum += pair.iou;
        }
      });

      const fp = clsPred.length - tp;
      const fn = clsGt.length - tp;

      totalTP += tp;
      totalFP += fp;
      totalFN += fn;
      totalIoUSum += iouSum;
      totalMatches += tp;

      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      const meanIou = tp > 0 ? iouSum / tp : 0;

      const mappedVlmLabels = vlmLabelsForGtClass(compareLabelMap, cls);

      return {
        key: cls,
        className: cls,
        mappedVlmLabels,
        gtCount: clsGt.length,
        vlmCount: clsPred.length,
        tp,
        fp,
        fn,
        precision,
        recall,
        f1,
        meanIou,
      };
    });

    totalFP += unmappedVlmCount;

    const globalPrecision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
    const globalRecall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;
    const globalF1 = globalPrecision + globalRecall > 0 ? (2 * globalPrecision * globalRecall) / (globalPrecision + globalRecall) : 0;
    const globalMeanIou = totalMatches > 0 ? totalIoUSum / totalMatches : 0;

    return {
      global: {
        precision: globalPrecision,
        recall: globalRecall,
        f1: globalF1,
        meanIou: globalMeanIou,
        tp: totalTP,
        fp: totalFP,
        fn: totalFN,
        gtTotal: gtBoxes.length,
        vlmTotal: predBoxes.length + unmappedVlmCount,
        unmappedVlm: unmappedVlmCount,
      },
      classStats,
    };
  }, [data, iouThreshold, selectedClasses, mappedVlmBoxes, compareLabelMap, unmappedVlmCount]);

  if (!compareDataset || !compareImage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50/30 rounded-2xl border border-dashed border-gray-200 p-12">
        <EyeOutlined className="text-4xl mb-4 text-gray-300" />
        <p className="text-base font-semibold text-gray-500">Compare annotations with Ground Truth</p>
        <p className="text-xs text-gray-400 max-w-sm text-center">
          Select a dataset and choose an image from the sidebar to visualize and compare human annotations against VLM-AutoYOLO detections.
        </p>
      </div>
    );
  }

  const imageUrl = compareImageUrl(compareDataset, compareImage.imagePath);

  const isVlmBoxVisible = (box: CompareBox) => {
    const mappedClass = mapVlmBoxClass(box.className, compareLabelMap);
    if (mappedClass) return selectedClasses[mappedClass];
    return true;
  };

  const isGtBoxVisible = (box: CompareBox) => selectedClasses[box.className];

  // Render SVG overlays for bounding boxes
  const renderBBoxes = (
    boxes: CompareBox[],
    color: string,
    showConf = false,
    isVisible: (box: CompareBox) => boolean = () => true,
    labelForBox?: (box: CompareBox) => string,
  ) => {
    if (!data) return null;
    return boxes.map((box, idx) => {
      if (!isVisible(box)) return null;

      const label = labelForBox ? labelForBox(box) : box.className;
      
      const width = box.x2 - box.x1;
      const height = box.y2 - box.y1;
      
      return (
        <g key={idx}>
          {/* Bounding Box Rect */}
          <rect
            x={box.x1}
            y={box.y1}
            width={width}
            height={height}
            fill="none"
            stroke={color}
            strokeWidth={Math.max(2, Math.round(data.dimensions.width / 500))}
            strokeDasharray={color === "#3B82F6" ? "none" : "none"} // Can style differently
            className="transition-all duration-300"
          />
          {/* Label Background */}
          <rect
            x={box.x1}
            y={Math.max(0, box.y1 - Math.round(data.dimensions.height / 30))}
            width={Math.round(label.length * (data.dimensions.width / 80)) + (showConf ? 45 : 0)}
            height={Math.round(data.dimensions.height / 30)}
            fill={color}
          />
          {/* Label Text */}
          <text
            x={box.x1 + 4}
            y={Math.max(12, box.y1 - Math.round(data.dimensions.height / 120))}
            fill="#FFFFFF"
            fontSize={Math.max(10, Math.round(data.dimensions.width / 75))}
            fontWeight="bold"
          >
            {label} {showConf && box.confidence ? `(${Math.round(box.confidence * 100)}%)` : ""}
          </text>
        </g>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1">
      {/* Header Info */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <span>Comparison View</span>
            <span className="text-xs bg-gray-100 text-gray-500 font-mono px-2 py-0.5 rounded-md border border-gray-200">
              {compareImage.split.toUpperCase()}
            </span>
          </h2>
          <p className="text-xs text-gray-400 font-mono truncate max-w-lg">
            {compareImage.imagePath}
          </p>
        </div>

        {/* Configurations */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-gray-600">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-lg">
            <span>View Mode:</span>
            <Radio.Group size="small" value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
              <Radio.Button value="side_by_side">Side-by-Side</Radio.Button>
              <Radio.Button value="overlay">Overlay</Radio.Button>
            </Radio.Group>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-lg">
            <span className="flex items-center gap-1">
              <SlidersOutlined /> Match IoU:
            </span>
            <Slider
              min={0.1}
              max={0.9}
              step={0.05}
              value={iouThreshold}
              onChange={setIouThreshold}
              style={{ width: 100, margin: "0 4px" }}
              tooltip={{ formatter: (v) => `IoU >= ${v}` }}
            />
            <span className="font-mono text-primary-600 font-bold w-8">{iouThreshold}</span>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-lg">
            <span>Auto-run VLM:</span>
            <Switch 
              size="small" 
              checked={autoRunVlm} 
              onChange={setAutoRunVlm} 
            />
          </div>
        </div>
      </div>

      {/* Main BBox Canvas Area */}
      {loading ? (
        <div className="flex-1 bg-white border border-gray-200/80 rounded-2xl p-16 flex flex-col items-center justify-center gap-3 min-h-[350px] shadow-sm">
          <Spin size="large" />
          <span className="text-sm font-semibold text-gray-500">Processing image predictions...</span>
        </div>
      ) : !data ? (
        <div className="flex-1 bg-white border border-gray-200/80 rounded-2xl p-16 flex flex-col items-center justify-center gap-4 min-h-[350px] shadow-sm">
          <Alert
            message="VLM prediction pending"
            description="LocateAnything-3B prediction has not been run or cached for this image yet."
            type="info"
            showIcon
            icon={<InfoCircleOutlined className="text-blue-500" />}
            className="w-full max-w-md"
          />
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => loadAnnotations(true)}
            disabled={compareVlmLabels.length === 0}
            size="large"
            className="bg-primary-600 hover:bg-primary-700 border-none font-bold"
          >
            Run VLM Annotation
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Legend and Class filters */}
          <div className="bg-gray-50/50 border border-gray-200/60 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4 text-xs font-semibold text-gray-500">
            <div className="flex items-center gap-4">
              <span className="font-bold uppercase tracking-wider text-[10px]">Legend:</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 bg-emerald-500 rounded border border-emerald-600"></span>
                <span className="text-emerald-700 font-bold">Human (Ground Truth)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 bg-blue-500 rounded border border-blue-600"></span>
                <span className="text-blue-700 font-bold">VLM-AutoYOLO (AI)</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-bold uppercase tracking-wider text-[10px]">Filter Classes:</span>
              {Object.keys(selectedClasses).map(cls => (
                <Checkbox
                  key={cls}
                  checked={selectedClasses[cls]}
                  onChange={(e) => setSelectedClasses(prev => ({ ...prev, [cls]: e.target.checked }))}
                >
                  <span className="font-bold text-gray-600">{cls}</span>
                </Checkbox>
              ))}
            </div>
          </div>

          {/* Dual layout renderings */}
          {viewMode === "side_by_side" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Panel: Ground Truth */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-sm flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Human Ground Truth</span>
                  <span className="text-xs text-gray-400 font-semibold">{data.humanBoxes.length} boxes</span>
                </div>
                <div className="relative border border-gray-100 rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center">
                  <img src={imageUrl} className="max-h-[500px] w-auto block object-contain" />
                  <svg
                    viewBox={`0 0 ${data.dimensions.width} ${data.dimensions.height}`}
                    className="absolute inset-0 w-full h-full pointer-events-none select-none"
                  >
                    {renderBBoxes(data.humanBoxes, "#10B981", false, isGtBoxVisible)}
                  </svg>
                </div>
              </div>

              {/* Right Panel: VLM predictions */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-sm flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">
                    VLM-AutoYOLO Predictions
                    {compareVlmLabels.length > 0 && (
                      <span className="ml-1 normal-case font-medium text-gray-400">
                        ({compareVlmLabels.join(", ")})
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400 font-semibold">
                    {data.vlmBoxes.length} boxes
                    {(compareMaxBBoxArea < 1 || compareMinConfidence > 0) && (
                      <span className="text-amber-600 ml-1">
                        {compareMaxBBoxArea < 1 && (
                          <span>max {Math.round(compareMaxBBoxArea * 100)}% area</span>
                        )}
                        {compareMaxBBoxArea < 1 && compareMinConfidence > 0 && ", "}
                        {compareMinConfidence > 0 && (
                          <span>min {Math.round(compareMinConfidence * 100)}% conf</span>
                        )}
                      </span>
                    )}
                  </span>
                </div>
                <div className="relative border border-gray-100 rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center">
                  <img src={imageUrl} className="max-h-[500px] w-auto block object-contain" />
                  <svg
                    viewBox={`0 0 ${data.dimensions.width} ${data.dimensions.height}`}
                    className="absolute inset-0 w-full h-full pointer-events-none select-none"
                  >
                    {renderBBoxes(
                      data.vlmBoxes,
                      "#3B82F6",
                      true,
                      isVlmBoxVisible,
                      (box) => {
                        const mapped = mapVlmBoxClass(box.className, compareLabelMap);
                        return mapped ? `${box.className} → ${mapped}` : `${box.className} (unmapped)`;
                      },
                    )}
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            /* Overlay Layout */
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Combined Bounding Boxes Overlay</span>
                <div className="flex items-center gap-3">
                  <Checkbox checked={showHuman} onChange={(e) => setShowHuman(e.target.checked)}>
                    <span className="text-emerald-600 font-semibold text-xs">Human GT</span>
                  </Checkbox>
                  <Checkbox checked={showVlm} onChange={(e) => setShowVlm(e.target.checked)}>
                    <span className="text-blue-600 font-semibold text-xs">VLM-AutoYOLO</span>
                  </Checkbox>
                </div>
              </div>
              <div className="relative border border-gray-100 rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center max-w-3xl mx-auto w-full">
                <img src={imageUrl} className="max-h-[550px] w-auto block object-contain" />
                <svg
                  viewBox={`0 0 ${data.dimensions.width} ${data.dimensions.height}`}
                  className="absolute inset-0 w-full h-full pointer-events-none select-none"
                >
                  {showHuman && renderBBoxes(data.humanBoxes, "#10B981", false, isGtBoxVisible)}
                  {showVlm &&
                    renderBBoxes(
                      data.vlmBoxes,
                      "#3B82F6",
                      true,
                      isVlmBoxVisible,
                      (box) => {
                        const mapped = mapVlmBoxClass(box.className, compareLabelMap);
                        return mapped ? `${box.className} → ${mapped}` : `${box.className} (unmapped)`;
                      },
                    )}
                </svg>
              </div>
            </div>
          )}

          {/* Metrics Analysis */}
          {metrics && (
            <div className="flex flex-col gap-6">
              {/* Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="shadow-sm border-gray-200/80 hover:shadow transition-shadow duration-300 rounded-2xl">
                  <Statistic
                    title={<span className="text-xs font-bold text-gray-400 uppercase tracking-wider">F1-Score</span>}
                    value={metrics.global.f1 * 100}
                    precision={1}
                    valueStyle={{ color: metrics.global.f1 >= 0.7 ? "#10B981" : "#F59E0B", fontWeight: 800 }}
                    suffix="%"
                    prefix={<ExperimentOutlined />}
                  />
                </Card>
                <Card className="shadow-sm border-gray-200/80 hover:shadow transition-shadow duration-300 rounded-2xl">
                  <Statistic
                    title={<span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Precision</span>}
                    value={metrics.global.precision * 100}
                    precision={1}
                    valueStyle={{ color: metrics.global.precision >= 0.7 ? "#10B981" : "#F59E0B", fontWeight: 800 }}
                    suffix="%"
                    prefix={<SafetyOutlined />}
                  />
                  <div className="text-[10px] text-gray-400 mt-1 font-semibold">
                    TP: {metrics.global.tp} | FP: {metrics.global.fp}
                    {metrics.global.unmappedVlm > 0 && (
                      <span> ({metrics.global.unmappedVlm} unmapped)</span>
                    )}
                  </div>
                </Card>
                <Card className="shadow-sm border-gray-200/80 hover:shadow transition-shadow duration-300 rounded-2xl">
                  <Statistic
                    title={<span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Recall</span>}
                    value={metrics.global.recall * 100}
                    precision={1}
                    valueStyle={{ color: metrics.global.recall >= 0.7 ? "#10B981" : "#F59E0B", fontWeight: 800 }}
                    suffix="%"
                    prefix={<SafetyOutlined />}
                  />
                  <div className="text-[10px] text-gray-400 mt-1 font-semibold">
                    TP: {metrics.global.tp} | FN: {metrics.global.fn}
                  </div>
                </Card>
                <Card className="shadow-sm border-gray-200/80 hover:shadow transition-shadow duration-300 rounded-2xl">
                  <Statistic
                    title={<span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mean IoU (Matches)</span>}
                    value={metrics.global.meanIou * 100}
                    precision={1}
                    valueStyle={{ color: metrics.global.meanIou >= 0.6 ? "#10B981" : "#F59E0B", fontWeight: 800 }}
                    suffix="%"
                    prefix={<DotChartOutlined />}
                  />
                </Card>
              </div>

              {/* Breakdown Table */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm">
                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3 px-1">
                  Per-Class BBox Matching Details
                </h3>
                <Table
                  dataSource={metrics.classStats}
                  pagination={false}
                  size="small"
                  className="text-xs font-semibold text-gray-700"
                  columns={[
                    {
                      title: "Ground Truth Class",
                      dataIndex: "className",
                      key: "className",
                      render: (text, row) => (
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-800">{text}</span>
                          {row.mappedVlmLabels.length > 0 && (
                            <span className="text-[10px] text-blue-500 font-medium">
                              VLM: {row.mappedVlmLabels.join(", ")}
                            </span>
                          )}
                        </div>
                      ),
                    },
                    {
                      title: "Ground Truth",
                      dataIndex: "gtCount",
                      key: "gtCount",
                      align: "center"
                    },
                    {
                      title: "VLM Predicted",
                      dataIndex: "vlmCount",
                      key: "vlmCount",
                      align: "center"
                    },
                    {
                      title: "Matched (TP)",
                      dataIndex: "tp",
                      key: "tp",
                      align: "center",
                      render: (tp) => <span className="text-emerald-600 font-bold">{tp}</span>
                    },
                    {
                      title: "Precision",
                      dataIndex: "precision",
                      key: "precision",
                      align: "right",
                      render: (v) => <span className="font-mono">{Math.round(v * 100)}%</span>
                    },
                    {
                      title: "Recall",
                      dataIndex: "recall",
                      key: "recall",
                      align: "right",
                      render: (v) => <span className="font-mono">{Math.round(v * 100)}%</span>
                    },
                    {
                      title: "F1 Score",
                      dataIndex: "f1",
                      key: "f1",
                      align: "right",
                      render: (v) => <span className="font-mono font-bold text-primary-600">{Math.round(v * 100)}%</span>
                    },
                    {
                      title: "Mean IoU",
                      dataIndex: "meanIou",
                      key: "meanIou",
                      align: "right",
                      render: (v) => <span className="font-mono text-gray-400">{Math.round(v * 100)}%</span>
                    }
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
