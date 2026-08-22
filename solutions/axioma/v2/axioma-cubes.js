import { dsls } from '@jb6/core'
import '@wonder/bi/metrics.js'
import '@wonder/bi/bi-dsl.js'

const { bi: {
  Cube, cube: { cube }, 'silver-builder': { parquetSource }, dimension: { dimension }, metric: { metric, ratio }
} } = dsls

Cube('axioma.trafficCube', {
  impl: cube(parquetSource('traffic_daily-${period}.parquet', 'traffic'), {
    dimensions: [
      dimension('day', { type: 'timestamp', guidance: 'calendar day of the observed request' }),
      dimension('agent', { guidance: 'AI/search agent identified by the request collector' }),
      dimension('domain'),
      dimension('url'),
      dimension('page'),
      dimension('page_id')
    ],
    metrics: [
      metric('requests', 'count', 'int', 'request rows at the cube grain'),
      metric('ai_visits', 'sum(total_ai_visits)', 'int', 'AI-agent page visits'),
      metric('ai_clicks', 'sum(total_ai_clicks)', 'int', 'AI-agent clicks'),
      metric('training_requests', 'sum(total_ai_train)', 'int', 'requests classified as training access'),
      metric('indexing_requests', 'sum(total_ai_index)', 'int', 'requests classified as indexing access'),
      metric('blocked_requests', 'sum(total_ai_blocked)', 'int', 'blocked AI requests'),
      metric('errors', 'sum(total_ai_error)', 'int', 'AI request errors'),
      metric('successful_requests', 'sum(total_ai_success)', 'int', 'successful AI requests'),
      ratio('blocked_rate', 'blocked_requests/requests', {
        description: 'share of request rows blocked by access policy'
      }),
      ratio('success_rate', 'successful_requests/requests', {
        description: 'share of request rows completed successfully'
      })
    ],
    limits: ['This cube observes requests; it does not identify the human behind an AI request.']
  })
})

Cube('axioma.searchCube', {
  impl: cube(parquetSource('query_breakdown_daily-${period}.parquet', 'search'), {
    dimensions: [
      dimension('day', { type: 'timestamp', guidance: 'Google Search Console reporting day' }),
      dimension('domain'),
      dimension('url'),
      dimension('prompt', { guidance: 'organic Google query text' }),
      dimension('page'),
      dimension('page_url'),
      dimension('is_branded', { type: 'integer' }),
      dimension('predicted_is_ai', { type: 'integer' }),
      dimension('prediction_label')
    ],
    metrics: [
      metric('query_rows', 'count', 'int'),
      metric('impressions', 'sum(total_gsc_impressions)', 'int', 'Google Search Console impressions'),
      metric('clicks', 'sum(total_gsc_clicks)', 'int', 'Google Search Console clicks'),
      metric({
        name: 'gsc_position_weighted',
        expr: 'sum(gsc_position_weighted)',
        unit: 'int',
        description: 'impression-weighted position numerator'
      }),
      metric({
        name: 'gsc_position_impressions',
        expr: 'sum(gsc_position_impressions)',
        unit: 'int',
        description: 'impressions included in position calculation'
      }),
      ratio('ctr', 'clicks/impressions', { description: 'Google clicks divided by impressions' }),
      ratio('avg_position', 'gsc_position_weighted/gsc_position_impressions', {
        scale: 1,
        unit: 'position',
        description: 'impression-weighted Google position'
      })
    ],
    limits: ['This cube reports Google Search Console performance; it is not a raw browser search log.']
  })
})

Cube('axioma.citationCube', {
  impl: cube(parquetSource('prompts_agg-${period}.parquet', 'promptRuns'), {
    dimensions: [
      dimension('time', { type: 'timestamp', guidance: 'time of the monitored prompt run' }),
      dimension('agent'),
      dimension('domain'),
      dimension('domain_normalized'),
      dimension('clean_url'),
      dimension('prompt_id'),
      dimension('run_id'),
      dimension('citation_title'),
      dimension('cited', { type: 'boolean' })
    ],
    metrics: [
      metric('prompt_runs', 'distinctCount(prompt_id)', 'int', 'unique monitored prompt runs'),
      metric({
        name: 'sourced_runs',
        expr: 'count(distinct case when total_sourced > 0 then prompt_id end)',
        unit: 'int',
        description: 'prompt runs where the domain was sourced'
      }),
      metric({
        name: 'cited_runs',
        expr: 'count(distinct case when cited then prompt_id end)',
        unit: 'int',
        description: 'prompt runs citing the page/domain'
      }),
      metric('source_references', 'sum(total_source_refs)', 'int', 'source references in AI answers'),
      metric('citation_references', 'sum(total_citation_refs)', 'int', 'citation references in AI answers'),
      metric('avg_citation_rank', 'avg(best_search_rank)', 'rank', 'average best source rank in the answer'),
      ratio('source_rate', 'sourced_runs/prompt_runs', {
        description: 'share of prompt runs sourcing the domain'
      }),
      ratio('citation_rate', 'cited_runs/prompt_runs', {
        description: 'share of prompt runs citing the domain'
      })
    ],
    limits: ['This cube measures monitored AI responses, not all public AI conversations.']
  })
})

Cube('axioma.crawlCube', {
  impl: cube(parquetSource('webpages_metadata.parquet', 'pages'), {
    dimensions: [
      dimension('domain'),
      dimension('url'),
      dimension('title'),
      dimension('status_code', { type: 'integer' }),
      dimension('published_at', { type: 'timestamp' }),
      dimension('last_modified', { type: 'timestamp' }),
      dimension('updated_at', { type: 'timestamp', guidance: 'when Axioma last re-crawled the page' })
    ],
    metrics: [
      metric('pages', 'distinctCount(url)', 'int', 'distinct crawled URLs'),
      metric({
        name: 'successful_pages',
        expr: 'sum(case when status_code between 200 and 299 then 1 else 0 end)',
        unit: 'int',
        description: 'URLs returning successful HTTP status'
      }),
      metric({
        name: 'failed_pages',
        expr: 'sum(case when status_code >= 400 then 1 else 0 end)',
        unit: 'int',
        description: 'URLs returning client/server error status'
      }),
      metric('latest_crawl', 'max(updated_at)', 'timestamp', 'latest recorded Axioma crawl'),
      metric({
        name: 'avg_days_since_crawl',
        expr: `avg(date_diff('day', cast(updated_at as date), current_date))`,
        unit: 'days',
        description: 'average crawl age at query time'
      })
    ],
    limits: ['This cube stores current page metadata; it does not preserve every historical crawl unless the source does.']
  })
})

Cube('axioma.evaluationCube', { impl: cube({
  source: parquetSource('question_answers_agg_hourly-${period}.parquet', { name: 'evaluations' }),
  dimensions: [
    dimension('date', { type: 'timestamp', guidance: 'evaluation date' }), dimension('question_id'), dimension('prompt_id'),
    dimension('question'), dimension('agent'), dimension('provider'), dimension('on_demand_scan_run_id')
  ],
  metrics: [
    metric('evaluation_rows', 'count', { unit: 'int' }),
    metric('yes_answers', 'sum(total_yes)', { unit: 'int', description: 'answers satisfying the configured question' }),
    metric('no_answers', 'sum(total_no)', { unit: 'int', description: 'answers failing the configured question' }),
    metric('answers', 'sum(total_answers)', { unit: 'int', description: 'evaluated answers' }),
    ratio('goal_rate', 'yes_answers/answers', { description: 'share of evaluated answers satisfying the question' })
  ],
  limits: ['This cube measures configured evaluation questions, not general answer quality.']
}) })
