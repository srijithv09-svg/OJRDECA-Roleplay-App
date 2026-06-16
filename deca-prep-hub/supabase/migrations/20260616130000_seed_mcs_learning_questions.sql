update public.concepts
set
  detailed_explanation = case slug
    when 'promotion' then 'Promotion connects a business message to the people it wants to influence. In DECA roleplays, strong promotion choices fit the audience, budget, timing, and business goal.'
    when 'target-market' then 'A target market helps a business avoid generic decisions. The more clearly a business understands the intended customer group, the easier it is to choose the right message, channel, and offer.'
    when 'brand-awareness' then 'Brand awareness matters because customers are more likely to consider businesses they recognize and trust. Awareness tactics should make the brand easier to remember in the right buying situation.'
    when 'positioning' then 'Positioning gives customers a reason to choose one business over another. A clear position highlights the benefits and differences that matter most to the target market.'
    when 'message-strategy' then 'Message strategy turns a business goal into persuasive communication. It should connect the audience, main benefit, proof, tone, and call to action.'
    else detailed_explanation
  end,
  common_misconceptions = case slug
    when 'promotion' then 'Promotion is not just advertising. It also includes public relations, sales promotion, personal selling, and other communication tools.'
    when 'target-market' then 'A target market is not everyone who could buy. It is the priority group the business is designing the decision around.'
    when 'brand-awareness' then 'Awareness is not the same as loyalty. It comes earlier: customers first need to recognize or remember the brand.'
    when 'positioning' then 'Positioning is not only a slogan. It is the customer perception the business intentionally builds over time.'
    when 'message-strategy' then 'A message strategy is not a random catchy phrase. It is a planned communication choice based on the audience and objective.'
    else common_misconceptions
  end,
  updated_at = now()
where slug in ('promotion', 'target-market', 'brand-awareness', 'positioning', 'message-strategy');

with mcs_event as (
  select id from public.events where code = 'MCS'
),
mcs_questions as (
  select
    mcs_event.id as event_id,
    concepts.id as concept_id,
    question_data.question_type,
    question_data.ladder_stage,
    question_data.prompt,
    question_data.choices,
    question_data.correct_answer,
    question_data.explanation,
    question_data.difficulty
  from mcs_event
  join (
    values
      (
        'promotion',
        'multiple_choice',
        'recognize',
        'Which choice is the best example of promotion?',
        '["Lowering supplier costs","Posting a limited-time offer on social media","Changing the store lease","Counting inventory after closing"]'::jsonb,
        '"Posting a limited-time offer on social media"'::jsonb,
        'Promotion communicates with a target audience to influence awareness, interest, or action.',
        'easy'
      ),
      (
        'promotion',
        'matching',
        'define',
        'Match each promotion tool to the best description.',
        '{"pairs":[{"left":"Advertising","options":["Paid message through media","Short-term incentive","Unpaid media attention"]},{"left":"Sales promotion","options":["Paid message through media","Short-term incentive","Unpaid media attention"]},{"left":"Public relations","options":["Paid message through media","Short-term incentive","Unpaid media attention"]}]}'::jsonb,
        '{"Advertising":"Paid message through media","Sales promotion":"Short-term incentive","Public relations":"Unpaid media attention"}'::jsonb,
        'Promotion includes several communication tools, each with a different purpose.',
        'medium'
      ),
      (
        'promotion',
        'multiple_select',
        'connect',
        'Which details should guide a promotion decision for a school-based business? Select all that apply.',
        '["Target audience","Budget","Business objective","Manager favorite color"]'::jsonb,
        '["Target audience","Budget","Business objective"]'::jsonb,
        'Promotion decisions should connect the audience, goal, budget, and channel.',
        'medium'
      ),
      (
        'promotion',
        'free_text',
        'explain',
        'A local pizza shop wants more students to visit after school. Explain one promotion tactic and why it fits the audience.',
        null::jsonb,
        null::jsonb,
        'A strong answer names a tactic, connects it to students, and explains why it would motivate action.',
        'medium'
      ),
      (
        'target-market',
        'multiple_choice',
        'recognize',
        'What is a target market?',
        '["A list of every possible customer","The specific customer group a business most wants to reach","The total sales from last month","A competitor in the same industry"]'::jsonb,
        '"The specific customer group a business most wants to reach"'::jsonb,
        'A target market is the priority customer group for a business decision.',
        'easy'
      ),
      (
        'target-market',
        'matching',
        'define',
        'Match each segmentation idea to the best example.',
        '{"pairs":[{"left":"Demographic","options":["Age or grade level","Neighborhood or region","Lifestyle or interests"]},{"left":"Geographic","options":["Age or grade level","Neighborhood or region","Lifestyle or interests"]},{"left":"Psychographic","options":["Age or grade level","Neighborhood or region","Lifestyle or interests"]}]}'::jsonb,
        '{"Demographic":"Age or grade level","Geographic":"Neighborhood or region","Psychographic":"Lifestyle or interests"}'::jsonb,
        'Segmentation helps define a useful target market.',
        'medium'
      ),
      (
        'target-market',
        'multiple_select',
        'connect',
        'A gym wants to reach busy high school athletes. Which choices fit that target market? Select all that apply.',
        '["After-school training packages","Messaging about performance and recovery","Ads only in a retirement newsletter","Short mobile-friendly sign-up form"]'::jsonb,
        '["After-school training packages","Messaging about performance and recovery","Short mobile-friendly sign-up form"]'::jsonb,
        'The best choices fit the audience schedule, needs, and media habits.',
        'medium'
      ),
      (
        'target-market',
        'free_text',
        'explain',
        'Explain why identifying a target market before choosing a promotion channel helps a business make a better decision.',
        null::jsonb,
        null::jsonb,
        'A strong answer connects audience insight to channel, message, and efficient use of resources.',
        'medium'
      ),
      (
        'brand-awareness',
        'multiple_choice',
        'recognize',
        'Which action most directly builds brand awareness?',
        '["Making a logo visible at a community event","Reducing payroll taxes","Changing a supplier contract","Closing the store early"]'::jsonb,
        '"Making a logo visible at a community event"'::jsonb,
        'Brand awareness grows when customers repeatedly notice and remember a brand.',
        'easy'
      ),
      (
        'brand-awareness',
        'matching',
        'define',
        'Match each awareness term to its meaning.',
        '{"pairs":[{"left":"Recognition","options":["Knowing the brand when seeing it","Remembering the brand without a prompt","Repeated exposure to the brand"]},{"left":"Recall","options":["Knowing the brand when seeing it","Remembering the brand without a prompt","Repeated exposure to the brand"]},{"left":"Frequency","options":["Knowing the brand when seeing it","Remembering the brand without a prompt","Repeated exposure to the brand"]}]}'::jsonb,
        '{"Recognition":"Knowing the brand when seeing it","Recall":"Remembering the brand without a prompt","Frequency":"Repeated exposure to the brand"}'::jsonb,
        'Awareness can include recognition, recall, and repeated exposure.',
        'medium'
      ),
      (
        'brand-awareness',
        'multiple_select',
        'connect',
        'Which tactics could improve awareness for a new smoothie shop near school? Select all that apply.',
        '["Consistent logo on cups and signs","Sampling at a school event","Posting only once with no follow-up","Partnering with a student club"]'::jsonb,
        '["Consistent logo on cups and signs","Sampling at a school event","Partnering with a student club"]'::jsonb,
        'Awareness improves through visible, repeated, audience-relevant exposure.',
        'medium'
      ),
      (
        'brand-awareness',
        'free_text',
        'explain',
        'Explain how brand awareness could help a new business earn consideration before customers are ready to buy.',
        null::jsonb,
        null::jsonb,
        'A strong answer explains that remembered brands are more likely to enter the customer choice set.',
        'medium'
      ),
      (
        'positioning',
        'multiple_choice',
        'recognize',
        'What does positioning describe?',
        '["How customers should perceive a product compared with alternatives","The number of employees on a shift","A warehouse shelf location","The legal owner of the business"]'::jsonb,
        '"How customers should perceive a product compared with alternatives"'::jsonb,
        'Positioning is about the place a brand or offer occupies in the customer mind.',
        'easy'
      ),
      (
        'positioning',
        'matching',
        'define',
        'Match the positioning focus to the example.',
        '{"pairs":[{"left":"Price position","options":["Affordable option","Fastest service","Premium quality"]},{"left":"Convenience position","options":["Affordable option","Fastest service","Premium quality"]},{"left":"Quality position","options":["Affordable option","Fastest service","Premium quality"]}]}'::jsonb,
        '{"Price position":"Affordable option","Convenience position":"Fastest service","Quality position":"Premium quality"}'::jsonb,
        'Positioning can focus on price, convenience, quality, or another valued difference.',
        'medium'
      ),
      (
        'positioning',
        'multiple_select',
        'connect',
        'A bookstore wants to position itself as the best study spot for students. Which choices support that position? Select all that apply.',
        '["Quiet seating and Wi-Fi","Student discount nights","Messaging about a calm study environment","Random posts about unrelated products"]'::jsonb,
        '["Quiet seating and Wi-Fi","Student discount nights","Messaging about a calm study environment"]'::jsonb,
        'Positioning is stronger when operations, offers, and messages reinforce the same perception.',
        'medium'
      ),
      (
        'positioning',
        'free_text',
        'explain',
        'Explain how a small business could use positioning to stand out from a larger competitor.',
        null::jsonb,
        null::jsonb,
        'A strong answer identifies a valued difference and connects it to customer perception.',
        'medium'
      ),
      (
        'message-strategy',
        'multiple_choice',
        'recognize',
        'Which question is most important when creating a message strategy?',
        '["What should the audience believe or do after the message?","How many chairs are in the office?","What is the business tax ID?","Which file name is shortest?"]'::jsonb,
        '"What should the audience believe or do after the message?"'::jsonb,
        'Message strategy starts with the intended audience response.',
        'easy'
      ),
      (
        'message-strategy',
        'matching',
        'define',
        'Match each message element to its role.',
        '{"pairs":[{"left":"Benefit","options":["Why the audience should care","Evidence that supports the claim","What the audience should do next"]},{"left":"Proof","options":["Why the audience should care","Evidence that supports the claim","What the audience should do next"]},{"left":"Call to action","options":["Why the audience should care","Evidence that supports the claim","What the audience should do next"]}]}'::jsonb,
        '{"Benefit":"Why the audience should care","Proof":"Evidence that supports the claim","Call to action":"What the audience should do next"}'::jsonb,
        'A message strategy should clarify the benefit, proof, and desired action.',
        'medium'
      ),
      (
        'message-strategy',
        'multiple_select',
        'connect',
        'Which details make a message strategy stronger? Select all that apply.',
        '["Clear target audience","Main benefit","Proof or reason to believe","Unrelated joke that distracts from the goal"]'::jsonb,
        '["Clear target audience","Main benefit","Proof or reason to believe"]'::jsonb,
        'Strong messages are audience-specific, benefit-focused, and credible.',
        'medium'
      ),
      (
        'message-strategy',
        'free_text',
        'explain',
        'Write a short message strategy for a school store trying to increase spirit wear sales before homecoming.',
        null::jsonb,
        null::jsonb,
        'A strong answer names the audience, benefit, support, tone, and action.',
        'medium'
      )
  ) as question_data(
    concept_slug,
    question_type,
    ladder_stage,
    prompt,
    choices,
    correct_answer,
    explanation,
    difficulty
  ) on true
  join public.concepts on concepts.slug = question_data.concept_slug
)
insert into public.questions (
  event_id,
  concept_id,
  question_type,
  ladder_stage,
  prompt,
  choices,
  correct_answer,
  explanation,
  difficulty,
  status,
  ai_generated,
  ai_extracted,
  admin_reviewed
)
select
  event_id,
  concept_id,
  question_type,
  ladder_stage,
  prompt,
  choices,
  correct_answer,
  explanation,
  difficulty,
  'approved',
  false,
  false,
  true
from mcs_questions
where not exists (
  select 1
  from public.questions
  where questions.event_id = mcs_questions.event_id
    and questions.concept_id = mcs_questions.concept_id
    and questions.prompt = mcs_questions.prompt
);
